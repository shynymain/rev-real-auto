// Rev 実データ出馬表対応 Worker
// /api/health
// /api/schedule : netkeiba出馬表から馬名・頭数・レース名を取得
// /api/results  : netkeiba結果ページから着順・払戻を取得（未確定なら result:null）

const HEADERS = {
  "content-type": "application/json;charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

const COURSE = {
  "札幌": "01", "函館": "02", "福島": "03", "新潟": "04", "東京": "05",
  "中山": "06", "中京": "07", "京都": "08", "阪神": "09", "小倉": "10"
};

// 直近運用用。ここに実開催だけを固定する。
// 中山など開催していない競馬場は絶対に出さない。
const RACE_PLAN = [
  { date:"2026/05/02", place:"東京", course:"05", kai:"02", day:"03", races:[9,10,11,12] },
  { date:"2026/05/02", place:"京都", course:"08", kai:"03", day:"03", races:[9,10,11,12] },
  { date:"2026/05/02", place:"新潟", course:"04", kai:"01", day:"01", races:[9,10,11,12] },
  { date:"2026/05/03", place:"東京", course:"05", kai:"02", day:"04", races:[9,10,11,12] },
  { date:"2026/05/03", place:"京都", course:"08", kai:"03", day:"04", races:[9,10,11,12] },
  { date:"2026/05/03", place:"新潟", course:"04", kai:"01", day:"02", races:[9,10,11,12] }
];

function json(obj, status=200){ return new Response(JSON.stringify(obj), {status, headers:HEADERS}); }
function pad2(n){ return String(n).padStart(2,"0"); }
function ymdCompact(date){ return date.replaceAll("/",""); }
function raceIdOf(plan, raceNo){ return `2026${plan.course}${plan.kai}${plan.day}${pad2(raceNo)}`; }
function appIdOf(plan, raceNo){ return `${ymdCompact(plan.date)}_${plan.place}_${raceNo}`; }
function clean(s=""){
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi,"")
    .replace(/<style[\s\S]*?<\/style>/gi,"")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&#039;/g,"'")
    .replace(/&quot;/g,'"')
    .replace(/\s+/g," ")
    .trim();
}
function uniq(arr){ return Array.from(new Set(arr.filter(Boolean))); }

async function fetchText(url){
  const r = await fetch(url, {
    headers:{
      "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language":"ja,en-US;q=0.8,en;q=0.7"
    }
  });
  if(!r.ok) throw new Error(`fetch failed ${r.status} ${url}`);
  return await r.text();
}

function parseRaceMeta(html, plan, raceNo){
  const title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
  let raceName = "";
  const h1 = clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||"");
  if(h1) raceName = h1.replace(/出馬表.*/,"").trim();
  if(!raceName && title) raceName = title.split(/[｜|-]/)[0].replace(/出馬表.*/,"").trim();
  raceName = raceName || `${plan.place}${raceNo}R`;

  const text = clean(html);
  const surface = /ダート/.test(text) ? "ダート" : (/芝/.test(text) ? "芝" : "");
  const distM = text.match(/(芝|ダート)\s*(\d{3,4})m/) || text.match(/(芝|ダ)\s*(\d{3,4})/);
  const distance = distM ? `${distM[2]}m` : "";
  let grade = "";
  if(/G1|GI|Ｇ１|ＧⅠ/.test(text)) grade="G1";
  else if(/G2|GII|Ｇ２|ＧⅡ/.test(text)) grade="G2";
  else if(/G3|GIII|Ｇ３|ＧⅢ/.test(text)) grade="G3";
  else if(/オープン|OP/.test(text)) grade="OP";
  else if(/3勝|３勝/.test(text)) grade="3勝";
  else if(/2勝|２勝/.test(text)) grade="2勝";
  else if(/1勝|１勝/.test(text)) grade="1勝";

  return { date:plan.date, place:plan.place, raceNo:String(raceNo), raceName, grade, condition:"", surface, distance, headcount:"" };
}

function parseHorsesFromNetkeiba(html){
  const horses = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for(const row of rows){
    if(!/HorseName|horse_title|db\/horse|horse\//i.test(row)) continue;
    const tds = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    const cells = tds.map(clean);
    let no = "";
    let frame = "";
    for(const c of cells){
      if(!frame && /^枠\s*\d+$/.test(c)) frame = c.replace(/\D/g,"");
      if(!no && /^\d{1,2}$/.test(c)) no = c;
    }
    const nameMatch = row.match(/<a[^>]+(?:db\/horse|horse\/)[^>]*>([\s\S]*?)<\/a>/i) || row.match(/class="[^"]*HorseName[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const name = clean(nameMatch?.[1] || "");
    if(!name || /馬名|お気に入り/.test(name)) continue;
    if(!no){
      const before = clean(row);
      const m = before.match(/(?:^|\s)(\d{1,2})\s+[^\s]+/);
      if(m) no = m[1];
    }
    if(!frame && no) frame = String(Math.ceil(Number(no)/2));
    if(no && !horses.some(h=>h.no===no)){
      horses.push({ frame, no, name, last1:"", last2:"", last3:"", odds:"", popularity:"" });
    }
  }
  horses.sort((a,b)=>Number(a.no)-Number(b.no));
  return horses;
}

function parseHorsesFallback(html){
  const text = clean(html);
  const names = [];
  const re = /(?:^|\s)(\d{1,2})\s+([ァ-ヴー一-龯A-Za-z0-9・ー]{2,24})\s/g;
  let m;
  while((m = re.exec(text))){
    const no = m[1], name = m[2];
    if(/出馬|人気|騎手|斤量|馬体重|単勝|オッズ/.test(name)) continue;
    if(Number(no)>=1 && Number(no)<=18 && !names.some(x=>x.no===no)){
      names.push({ frame:String(Math.ceil(Number(no)/2)), no, name, last1:"", last2:"", last3:"", odds:"", popularity:"" });
    }
  }
  names.sort((a,b)=>Number(a.no)-Number(b.no));
  return names;
}

async function getOdds(raceId){
  // netkeiba odds page. 取れない場合は空欄で返す。
  try{
    const url = `https://race.netkeiba.com/odds/index.html?race_id=${raceId}&type=1`;
    const html = await fetchText(url);
    const text = clean(html);
    const odds = {};
    // 馬番 馬名 単勝 人気 の並びをざっくり抽出
    const re = /(?:^|\s)(\d{1,2})\s+[ァ-ヴー一-龯A-Za-z0-9・ー]{2,24}\s+([0-9]+\.[0-9])\s+(\d{1,2})\s/g;
    let m;
    while((m = re.exec(text))){ odds[m[1]] = {odds:m[2], popularity:m[3]}; }
    return odds;
  }catch(e){ return {}; }
}

async function parseEntry(plan, raceNo){
  const raceId = raceIdOf(plan, raceNo);
  const url = `https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`;
  const html = await fetchText(url);
  const race = parseRaceMeta(html, plan, raceNo);
  let horses = parseHorsesFromNetkeiba(html);
  if(horses.length===0) horses = parseHorsesFallback(html);
  const odds = await getOdds(raceId);
  horses = horses.map(h => ({...h, odds: odds[h.no]?.odds || h.odds || "", popularity: odds[h.no]?.popularity || h.popularity || ""}));
  race.headcount = String(horses.length || "");
  return { id:appIdOf(plan, raceNo), raceId, sourceUrl:url, race, horses };
}

function parseResultNumbers(html){
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const placed = [];
  for(const row of rows){
    const txt = clean(row);
    // 着順 馬番 馬名 の近似
    const m = txt.match(/^\s*(1|2|3)\s+(\d{1,2})\s+/) || txt.match(/(?:^|\s)(1|2|3)\s+\S+\s+(\d{1,2})\s+/);
    if(m) placed.push({rank:m[1], no:m[2]});
  }
  const firstNo = placed.find(x=>x.rank==="1")?.no || "";
  const secondNo = placed.find(x=>x.rank==="2")?.no || "";
  const thirdNo = placed.find(x=>x.rank==="3")?.no || "";
  return { firstNo, secondNo, thirdNo };
}

function parsePays(html, firstNo, secondNo, thirdNo){
  const text = clean(html);
  const umPair = firstNo && secondNo ? [Number(firstNo),Number(secondNo)].sort((a,b)=>a-b).join("-") : "";
  const sanPair = firstNo && secondNo && thirdNo ? [Number(firstNo),Number(secondNo),Number(thirdNo)].sort((a,b)=>a-b).join("-") : "";
  let umarenPay = "";
  let sanrenpukuPay = "";
  const um = text.match(/馬連\s+\d+[-－]\d+\s+([0-9,]+)円/) || text.match(/馬連[\s\S]{0,80}?([0-9,]+)円/);
  if(um) umarenPay = um[1].replace(/,/g,"");
  const san = text.match(/3連複\s+\d+[-－]\d+[-－]\d+\s+([0-9,]+)円/) || text.match(/三連複[\s\S]{0,80}?([0-9,]+)円/) || text.match(/3連複[\s\S]{0,80}?([0-9,]+)円/);
  if(san) sanrenpukuPay = san[1].replace(/,/g,"");
  return { umaren:umPair, umarenPay, sanrenpuku:sanPair, sanrenpukuPay };
}

async function parseResult(plan, raceNo){
  const raceId = raceIdOf(plan, raceNo);
  const url = `https://race.netkeiba.com/race/result.html?race_id=${raceId}`;
  try{
    const html = await fetchText(url);
    const nums = parseResultNumbers(html);
    if(!nums.firstNo || !nums.secondNo || !nums.thirdNo){
      return { id:appIdOf(plan,raceNo), raceId, result:null, status:"before_result", sourceUrl:url };
    }
    return { id:appIdOf(plan,raceNo), raceId, result:{...nums, ...parsePays(html, nums.firstNo, nums.secondNo, nums.thirdNo)}, sourceUrl:url };
  }catch(e){
    return { id:appIdOf(plan,raceNo), raceId, result:null, status:"fetch_failed", error:String(e.message||e), sourceUrl:url };
  }
}

async function schedule(){
  const races = [];
  const errors = [];
  for(const plan of RACE_PLAN){
    for(const r of plan.races){
      try{
        const item = await parseEntry(plan, r);
        if(item.horses && item.horses.length>0) races.push(item);
        else errors.push({id:appIdOf(plan,r), raceId:raceIdOf(plan,r), error:"no horses parsed"});
      }catch(e){
        errors.push({id:appIdOf(plan,r), raceId:raceIdOf(plan,r), error:String(e.message||e)});
      }
    }
  }
  return { ok:true, source:"real-netkeiba-entry", count:races.length, races, errors };
}

async function results(){
  const out = [];
  for(const plan of RACE_PLAN){
    for(const r of plan.races){ out.push(await parseResult(plan,r)); }
  }
  return { ok:true, source:"real-netkeiba-result", results:out };
}

export default {
  async fetch(request){
    if(request.method === "OPTIONS") return json({ok:true});
    const url = new URL(request.url);
    try{
      if(url.pathname === "/api/health") return json({ok:true, name:"rev-real-entry-worker"});
      if(url.pathname === "/api/schedule") return json(await schedule());
      if(url.pathname === "/api/results") return json(await results());
      return json({ok:false, error:"not found"}, 404);
    }catch(e){
      return json({ok:false, error:String(e.message||e)}, 500);
    }
  }
};
