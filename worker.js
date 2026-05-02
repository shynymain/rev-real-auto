const headers = {
  "content-type": "application/json;charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

function demoHorses(headcount = 16) {
  const names = [
    "サンプルスター", "ラインファイブ", "ミドルキング", "アクシスロード",
    "ネクストワン", "グリーンブリッジ", "テンポイント", "オッズメーカー",
    "ファイブリンク", "トライゲート", "スピードノート", "ラストフォース",
    "セブンライト", "ナインコード", "フォーカスアイ", "トップライン",
    "ディープシグナル", "レッドバランス"
  ];
  return Array.from({ length: headcount }, (_, i) => {
    const no = i + 1;
    return {
      frame: String(Math.ceil(no / 2)),
      no: String(no),
      name: names[i] || `サンプル${no}`,
      last1: String([1,4,9,6,8,5,12,3,7,10,2,11,15,14,13,16,18,17][i] || no),
      last2: String([5,1,4,9,6,8,3,7,10,2,11,15,14,13,16,18,17,12][i] || no),
      last3: String([9,5,1,4,9,6,8,3,7,10,2,11,15,14,13,16,18,17][i] || no),
      odds: String((2.1 + i * 1.7).toFixed(1)),
      popularity: String(no)
    };
  });
}

function makeRaces() {
  const races = [
    { id:"20260503_TOKYO_10", race:{date:"2026/05/03", place:"東京", raceNo:"10", raceName:"府中ステークス", grade:"3勝", condition:"4歳以上", surface:"芝", distance:"2000m", headcount:"16"}},
    { id:"20260503_TOKYO_11", race:{date:"2026/05/03", place:"東京", raceNo:"11", raceName:"青葉賞", grade:"G2", condition:"3歳", surface:"芝", distance:"2400m", headcount:"16"}},
    { id:"20260503_KYOTO_11", race:{date:"2026/05/03", place:"京都", raceNo:"11", raceName:"天皇賞・春", grade:"G1", condition:"4歳以上", surface:"芝", distance:"3200m", headcount:"18"}},
    { id:"20260504_NIIGATA_11", race:{date:"2026/05/04", place:"新潟", raceNo:"11", raceName:"谷川岳ステークス", grade:"OP", condition:"4歳以上", surface:"芝", distance:"1600m", headcount:"15"}}
  ];
  return races.map(r => ({ ...r, horses: demoHorses(Number(r.race.headcount || 16)) }));
}

function makeResults() {
  return [
    { id:"20260503_TOKYO_10", result:{ firstNo:"9", secondNo:"5", thirdNo:"14", umaren:"5-9", umarenPay:"2480", sanrenpuku:"5-9-14", sanrenpukuPay:"8640" }},
    { id:"20260503_TOKYO_11", result:{ firstNo:"14", secondNo:"5", thirdNo:"15", umaren:"5-14", umarenPay:"1320", sanrenpuku:"5-14-15", sanrenpukuPay:"3910" }}
  ];
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return json({ ok:true });
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/api/health") {
      return json({ ok:true, name:"real-auto-worker", mode:"instant-demo" });
    }

    if (url.pathname === "/api/schedule") {
      return json({ ok:true, source:"instant-demo", races: makeRaces() });
    }

    if (url.pathname === "/api/results") {
      return json({ ok:true, source:"instant-demo", results: makeResults() });
    }

    if (url.pathname === "/api/advice") {
      let body = {};
      try { body = await request.json(); } catch(e) {}
      return json({
        ok:true,
        confidence:"中",
        axis: body.axis || "5",
        umaren:["5-9","5-14","5-15"],
        sanrenpuku:["5-9-14","5-9-15","5-14-15","4-5-9","5-8-14"],
        comment:"即動作確認用AI回答です。5系接続を軸に、馬連3点・3連複5点で仮出力しています。"
      });
    }

    return json({ ok:false, error:"not found", path:url.pathname }, 404);
  }
};
