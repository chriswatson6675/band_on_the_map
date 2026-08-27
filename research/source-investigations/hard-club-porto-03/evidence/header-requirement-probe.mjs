import { writeFile } from "node:fs/promises";
import { fetchText, USER_AGENT } from "./ingestion/http/fetch.mjs";

const OUT = "./research/source-investigations/hard-club-porto-03/evidence/";
const bootstrapUrl = "https://www.hardclubporto.com/PT/agenda/";
const listUrl = "https://www.hardclubporto.com/include/ajax_functions.php?action=load-agenda&start=0&langid=1&passo=30&evento=";

async function bootstrap() {
  const res = await fetch(bootstrapUrl, { headers: { "User-Agent": USER_AGENT } });
  const text = await res.text();
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookieHeader, bodyLen: text.length };
}

async function main() {
  const retrievedAt = new Date().toISOString();

  const bootA = await bootstrap();
  const resA = await fetchText(listUrl, { headers: { Cookie: bootA.cookieHeader } });
  await writeFile(OUT + "case-a-cookie-only.txt",
    `retrieved_at: ${retrievedAt}\nrequest_url: ${listUrl}\nrequest_headers: {"Cookie": "${bootA.cookieHeader}"}\nsession_bootstrap_status: ${bootA.status}\nresponse_status: ${resA.status}\nresponse_body_length: ${resA.text.length}\nresponse_body: ${JSON.stringify(resA.text)}\n`);
  console.log("case A (cookie only) body length:", resA.text.length);

  const bootB = await bootstrap();
  const resB = await fetchText(listUrl, { headers: { Cookie: bootB.cookieHeader, Referer: bootstrapUrl } });
  await writeFile(OUT + "case-b-cookie-plus-referer.txt",
    `retrieved_at: ${retrievedAt}\nrequest_url: ${listUrl}\nrequest_headers: {"Cookie": "${bootB.cookieHeader}", "Referer": "${bootstrapUrl}"}\nsession_bootstrap_status: ${bootB.status}\nresponse_status: ${resB.status}\nresponse_body_length: ${resB.text.length}\nresponse_body: ${JSON.stringify(resB.text)}\n`);
  console.log("case B (cookie+referer) body length:", resB.text.length);

  const bootC = await bootstrap();
  const resC = await fetchText(listUrl, { headers: { Cookie: bootC.cookieHeader, "X-Requested-With": "XMLHttpRequest" } });
  await writeFile(OUT + "case-c-cookie-plus-xrw.txt",
    `retrieved_at: ${retrievedAt}\nrequest_url: ${listUrl}\nrequest_headers: {"Cookie": "${bootC.cookieHeader}", "X-Requested-With": "XMLHttpRequest"}\nsession_bootstrap_status: ${bootC.status}\nresponse_status: ${resC.status}\nresponse_body_length: ${resC.text.length}\nresponse_body (first 4000 chars): ${JSON.stringify(resC.text.slice(0, 4000))}\n`);
  console.log("case C (cookie+XRW) body length:", resC.text.length);

  const resD = await fetchText(listUrl, { headers: { "X-Requested-With": "XMLHttpRequest" } });
  await writeFile(OUT + "case-d-no-cookie-plus-xrw.txt",
    `retrieved_at: ${retrievedAt}\nrequest_url: ${listUrl}\nrequest_headers: {"X-Requested-With": "XMLHttpRequest"} (no session cookie at all)\nresponse_status: ${resD.status}\nresponse_body_length: ${resD.text.length}\nresponse_body (first 2000 chars): ${JSON.stringify(resD.text.slice(0, 2000))}\n`);
  console.log("case D (no cookie, XRW only) body length:", resD.text.length);
}
main().catch(e => { console.error(e); process.exit(1); });
