export default {
  async fetch(request) {
    const headers = {
      "content-type": "application/json;charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    };
    const json = (o, s=200)=>new Response(JSON.stringify(o),{status:s,headers});
    if (request.method === "OPTIONS") return json({ ok:true });

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok:true, name:"pseudo-jra-worker" });
    }

    const rint = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;
    const pick = (arr)=>arr[rint(0,arr.length-1)];
    const places = ["東京","中山","阪神","京都","中京","新潟","札幌","函館","福島","小倉"];
    const raceNames = ["ステークス","特別","カップ","記念","チャレンジ","オープン"];
    const grades = ["G1","G2","G3","OP","3勝","2勝"];
    const surfaces = ["芝","ダート"];

    function genOdds(n){
      let base = 1.5;
      const arr = [];
      for(let i=0;i<n;i++){
        base += Math.random()*2.5;
        const v = Math.max(1.2, Math.round(base*10)/10);
        arr.push(v);
        if (Math.random()<0.15 && i>0) arr[i] = arr[i-1];
      }
      return arr;
    }

    function rankByOdds(odds){
      const pairs = odds.map((o,i)=>({o,i})).sort((a,b)=>a.o-b.o);
      const pop = Array(odds.length).fill(0);
      let rank = 1;
      for(let i=0;i<pairs.length;){
        const same = [pairs[i]];
        let j=i+1;
        while(j<pairs.length && pairs[j].o===pairs[i].o){ same.push(pairs[j]); j++; }
        for(const p of same){ pop[p.i] = rank; }
        rank += same.length;
        i = j;
      }
      return pop;
    }

    function genHorses(n){
      const odds = genOdds(n);
      const pops = rankByOdds(odds);
      const horses = [];
      for(let i=0;i<n;i++){
        horses.push({
          frame: String(Math.ceil((i+1)/2)),
          no: String(i+1),
          name: `ホース${i+1}`,
          last1: String(rint(1,15)),
          last2: String(rint(1,15)),
          last3: String(rint(1,15)),
          odds: String(odds[i]),
          popularity: String(pops[i])
        });
      }
      return horses;
    }

    function genWeekDates(){
      const today = new Date();
      const dates = [];
      for(let i=0;i<3;i++){
        const d = new Date(today);
        d.setDate(today.getDate()+i);
        const y = d.getFullYear();
        const m = String(d.getMonth()+1).padStart(2,"0");
        const da = String(d.getDate()).padStart(2,"0");
        dates.push(`${y}/${m}/${da}`);
      }
      return dates;
    }

    function genSchedule(){
      const dates = genWeekDates();
      const races = [];
      for(const date of dates){
        const place = pick(places);
        const dayTag = date.replaceAll("/","");
        for(let r=9; r<=12; r++){
          const head = rint(12,18);
          const id = `${dayTag}_${place}_${r}`;
          races.push({
            id,
            race:{
              date,
              place,
              raceNo: String(r),
              raceName: `${place}${pick(raceNames)}`,
              grade: pick(grades),
              condition: `${rint(3,4)}歳以上`,
              surface: pick(surfaces),
              distance: `${rint(1200,2400)}m`,
              headcount: String(head)
            },
            horses: genHorses(head)
          });
        }
      }
      return races;
    }

    function genResultsFromSchedule(races){
      const results = [];
      for(const rc of races){
        const n = Number(rc.race.headcount||16);
        const picks = new Set();
        while(picks.size<3) picks.add(rint(1,n));
        const [a,b,c] = Array.from(picks);
        const um = [a,b].sort((x,y)=>x-y).join("-");
        const san = [a,b,c].sort((x,y)=>x-y).join("-");
        results.push({
          id: rc.id,
          result:{
            firstNo: String(a),
            secondNo: String(b),
            thirdNo: String(c),
            umaren: um,
            umarenPay: String(rint(800,5000)),
            sanrenpuku: san,
            sanrenpukuPay: String(rint(2000,15000))
          }
        });
      }
      return results;
    }

    let racesCache = genSchedule();
    let resultsCache = genResultsFromSchedule(racesCache);

    if (url.pathname === "/api/schedule") {
      racesCache = genSchedule();
      resultsCache = genResultsFromSchedule(racesCache);
      return json({ ok:true, source:"pseudo-jra", races: racesCache });
    }

    if (url.pathname === "/api/results") {
      return json({ ok:true, source:"pseudo-jra", results: resultsCache });
    }

    return json({ ok:false, error:"not found" }, 404);
  }
};
