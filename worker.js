export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = {"content-type":"application/json","access-control-allow-origin":"*"};

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ok:true,name:"real-auto-worker"}),{headers});
    }

    if (url.pathname === "/api/schedule") {
      return new Response(JSON.stringify({
        ok:true,
        source:"real-jra-style",
        races:[]
      }),{headers});
    }

    if (url.pathname === "/api/results") {
      return new Response(JSON.stringify({ok:true,results:[]}),{headers});
    }

    if (url.pathname === "/api/advice") {
      return new Response(JSON.stringify({ok:true,advice:"AI分析OK"}),{headers});
    }

    return new Response(JSON.stringify({ok:false}),{status:404,headers});
  }
};