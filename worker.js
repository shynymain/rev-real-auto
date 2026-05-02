const headers = {
  "content-type": "application/json;charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};
const json = (obj, status=200)=>new Response(JSON.stringify(obj),{status,headers});

// SAFE real-entry worker
// 目的：文字化け・頭数不明・馬名不明のレースを保存させない。
// 取得できない場合は races に入れず errors に出す。

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return json({ ok:true });
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok:true, name:"real-entry-safe-worker", mode:"no-garbled-output" });
    }

    if (url.pathname === "/api/schedule" || url.pathname === "/api/") {
      return handleSchedule(url);
    }

    if (url.pathname === "/api/results") {
      // 実結果取得はまだ安全化優先。未取得なら空で返す。
      return json({ ok:true, source:"real-entry-safe", results:[], errors:["results real fetch is disabled in safe mode"] });
    }

    return json({ ok:false, error:"not found", path:url.pathname },404);
  }
};

function ymd(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}${m}${d}`;
}
function ymdSlash(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}/${m}/${d}`;
}
function stripHtml(s){
  return String(s||"")
    .replace(/<script[\s\S]*?<\/script>/gi,"")
    .replace(/<style[\s\S]*?<\/style>/gi,"")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(parseInt(n,10)))
    .replace(/\s+/g," ")
    .trim();
}
function hasGarbled(s){
  // 文字化け記号が混ざるものは保存禁止
  return /[�□]/.test(String(s||""));
}
function hasJapanese(s){
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(s||""));
}
function validRaceName(s){
  const t=String(s||"").trim();
  if(!t || hasGarbled(t)) return false;
  if(t.length<2 || t.length>40) return false;
  return hasJapanese(t);
}
function validHorseName(s){
  const t=String(s||"").trim();
  if(!t || hasGarbled(t)) return false;
  if(t.length<2 || t.length>30) return false;
  return hasJapanese(t);
}
function rankByOdds(horses){
  const arr = horses.map((h,i)=>({i,o:Number(h.odds||999)})).sort((a,b)=>a.o-b.o);
  let rank=1;
  for(let i=0;i<arr.length;){
    let j=i+1;
    while(j<arr.length && arr[j].o===arr[i].o) j++;
    for(let k=i;k<j;k++) horses[arr[k].i].popularity=String(rank);
    rank += (j-i); i=j;
  }
}

async function fetchText(url){
  const res = await fetch(url, { headers:{ "user-agent":"Mozilla/5.0" } });
  const buf = await res.arrayBuffer();
  const ct = res.headers.get("content-type") || "";
  let text;
  try {
    // JRA/競馬系は Shift_JIS の場合がある。まず指定文字コードを尊重。
    if (/shift[_-]?jis|sjis/i.test(ct)) text = new TextDecoder("shift_jis").decode(buf);
    else if (/euc-jp/i.test(ct)) text = new TextDecoder("euc-jp").decode(buf);
    else text = new TextDecoder("utf-8").decode(buf);
  } catch(e) {
    text = new TextDecoder("utf-8").decode(buf);
  }
  // utf-8で文字化けした場合はShift_JISで再試行
  if (hasGarbled(text)) {
    try { text = new TextDecoder("shift_jis").decode(buf); } catch(e) {}
  }
  return { ok:res.ok, status:res.status, text, contentType:ct };
}

// 注意：JRA公式のページ構造は変わるため、厳密取得できない場合は保存しない。
// 現時点では「文字化けを出さない」「不正データを混ぜない」ことを最優先。
async function handleSchedule(url){
  const errors=[];
  const races=[];
  const days = Number(url.searchParams.get("days") || 2);
  const base = new Date();
  for(let di=0; di<days; di++){
    const d = new Date(base); d.setDate(base.getDate()+di);
    // 開催候補は固定しない。実取得できたものだけ採用。
    // ユーザーの既存フロント互換のため、失敗時は races=[] にする。
    errors.push(`${ymdSlash(d)}: real entry parser did not confirm clean race data; skipped`);
  }

  return json({
    ok:true,
    source:"real-entry-safe",
    mode:"safe-no-garbled-no-fake",
    races,
    errors,
    message:"文字化け・馬名不明・頭数不明のレースは保存しない安全版です。実取得パーサー未確定のため、偽データは返しません。"
  });
}
