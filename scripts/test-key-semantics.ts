/**
 * Unit test for the NEW-KEY semantics building blocks (no DB needed):
 * - KieError carries the raw kie.ai code
 * - isKieKeyProblem classifies 401/402 only
 * - mapKieCode preserves codes
 * - maskKey hides short/long keys safely
 */
import { KieError, mapKieCode, isKieKeyProblem } from "../src/lib/kie-server";
import { maskKey } from "../src/lib/key-vault";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
}

const e402 = mapKieCode(402, "");
check("402 mapped with code", e402.code === 402 && e402.status === 402);
check("402 is key problem", isKieKeyProblem(e402));

const e401 = mapKieCode(401, "");
check("401 mapped with code", e401.code === 401);
check("401 is key problem", isKieKeyProblem(e401));

const e422 = mapKieCode(422, "bad frames");
check("422 not key problem", !isKieKeyProblem(e422));
check("429 not key problem", !isKieKeyProblem(mapKieCode(429, "")));
check("generic KieError not key problem", !isKieKeyProblem(new KieError("network", 502)));
check("non-KieError not key problem", !isKieKeyProblem(new Error("x")));

const masked = maskKey("sk-abcdefghijklmnop");
check("maskKey keeps first4+last4", masked === "sk-a…mnop");
check("maskKey hides short keys", maskKey("short") === "••••");
check("maskKey empty-safe", maskKey("") === "••••");

// enrichKeyProblem shape (replicated inline since it is module-private):
check("402 message stays Arabic", e402.message.includes("رصيد kie.ai غير كافٍ"));

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
