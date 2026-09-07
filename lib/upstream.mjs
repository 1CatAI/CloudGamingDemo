import http from 'node:http';
import https from 'node:https';

export function request(url, { method = 'GET', json, headers = {}, timeout = 15000, maxBytes = 2*1024*1024 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = json === undefined ? null : JSON.stringify(json);
    let finished=false, deadline;
    const complete=(error,value)=>{
      if(finished) return;
      finished=true;clearTimeout(deadline);
      if(error) reject(error);else resolve(value);
    };
    const req = (target.protocol === 'https:' ? https : http).request(target, {
      method,
      // Sunshine's self-signed management endpoint is only used over loopback.
      rejectUnauthorized: target.hostname !== '127.0.0.1',
      headers: { ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}), ...headers }
    }, res => {
      let text = '';
      let bytes=0;
      res.setEncoding('utf8');
      res.on('data', chunk => {
        bytes+=Buffer.byteLength(chunk);
        if(bytes>maxBytes){const error=new Error('Upstream response too large');complete(error);res.destroy(error);req.destroy(error);return;}
        text += chunk;
      });
      res.on('aborted',()=>complete(new Error('Upstream response aborted')));
      res.on('error',error=>complete(error));
      res.on('close',()=>{if(!res.complete) complete(new Error('Upstream response closed before completion'));});
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return complete(new Error(`${method} ${target.pathname}: HTTP ${res.statusCode}: ${text.slice(0,300)}`));
        }
        let data = null;
        try { data = JSON.parse(text); } catch {}
        complete(null,{ status: res.statusCode, headers: res.headers, text, data });
      });
    });
    deadline=setTimeout(()=>{const error=new Error('Upstream timeout');complete(error);req.destroy(error);},timeout);
    req.on('error',error=>complete(error));
    if (body) req.write(body);
    req.end();
  });
}
