import test from "node:test";
import assert from "node:assert/strict";
import { createCatalog, prolevelRows, cacheRows } from "./catalog.js";
import { getCachedEvaluation } from "../src/lib/evaluation-cache.ts";
import { createSheetReader } from "./google-reader.js";
import reader from "./reader.cjs";
import { Hono } from "hono";
import { installChatgptReadOnly } from "./install.js";
const month = "2026-11";
test("latest successful prolevel append matches current fallback policy and keeps absent grades null", () => {
  const head = [
    "学籍番号",
    "氏名",
    "総合評価",
    "欠席",
    "遅刻",
    "ミッション",
    "支払い",
    "アクティブリスニング",
    "理解度",
    "コメント",
    "評価日時",
  ];
  const rows = [
    head,
    ["A", "fixture", "A", "S", "A", "B", "S", "A", "", "ok", "2026-11-01"],
    [
      "A",
      "fixture",
      "D",
      "D",
      "D",
      "D",
      "D",
      "D",
      "D",
      "【ミッション】分析エラー: synthetic",
      "2026-11-02",
    ],
    [
      "B",
      "fixture",
      "C",
      "",
      "",
      "",
      "",
      "",
      "",
      "【トークメモ】トークメモが見つかりません。",
    ],
  ];
  const result = prolevelRows(rows, month);
  assert.equal(result.length, 1);
  assert.equal(result[0].overall_grade, "A");
  assert.equal(result[0].comprehension_grade, null);
  assert.equal(result[0].attendance_grade, null);
  assert.equal(
    prolevelRows(
      [
        head,
        ...rows.slice(1),
        ["A", "fixture", "B", "S", "A", "B", "S", "A", "C", "ok", "2026-11-03"],
      ],
      month,
    )[0].overall_grade,
    "B",
  );
  assert.throws(() => prolevelRows([["氏名"]], month), /headers/);
});
test("old combined attendance column is not reinterpreted as separate absence/lateness", () => {
  const r = prolevelRows(
    [
      [
        "学籍番号",
        "総合評価",
        "欠席・遅刻評価",
        "ミッション評価",
        "評価コメント",
      ],
      ["A", "A", "B", "C", "ok"],
    ],
    month,
  )[0];
  assert.equal(r.attendance_grade, "B");
  assert.equal(r.absence_grade, null);
  assert.equal(r.lateness_grade, null);
  assert.equal(r.mission_grade, "C");
});
test("SNS selection matches existing saved-cache eligibility, keeps zero, omits unapproved payload keys", async () => {
  const head = [
    "学籍番号",
    "生徒名",
    "評価月",
    "評価データ",
    "キャッシュ日時",
    "有効期限",
  ];
  for (const type of ["youtube", "x"]) {
    const good = {
      overallGrade: "A",
      videosInMonth: 2,
      subscriberCount: 10,
      totalViews: 100,
      tweetsInMonth: 2,
      followersCount: 3,
      totalLikes: 0,
      private_access_token: "fixture-never-export",
    };
    const bad =
      type === "youtube"
        ? { ...good, subscriberCount: 0 }
        : { ...good, tweetsInMonth: 0, followersCount: 0 };
    const rows = [
      head,
      ["A", "fixture", month, JSON.stringify(good), "2026-11-01", "2020-01-01"],
      ["A", "fixture", month, JSON.stringify(bad), "2026-11-02", "2099-01-01"],
    ];
    const current = await getCachedEvaluation(
        "fixture-token",
        "fixture-sheet",
        "A",
        month,
        type,
        rows,
      ),
      r = cacheRows(rows, month, type)[0];
    assert.equal(r.overall_grade, current.overallGrade);
    assert.equal(r.cached_at, "2026-11-01");
    assert.equal(r.totalLikes, 0);
    assert.equal(r.status, "stored");
    assert.equal(JSON.stringify(r).includes("private_access_token"), false);
    assert.equal(cacheRows(rows, "2026-10", type).length, 0);
  }
});
test("invalid/incomplete SNS cache is explicit and never fabricates zero or a grade", () => {
  const h = ["学籍番号", "評価月", "評価データ", "キャッシュ日時"];
  const rows = [
    h,
    ["A", month, "{broken", "2026-11-01"],
    [
      "B",
      month,
      JSON.stringify({
        tweetsInMonth: 0,
        followersCount: 0,
        overallGrade: "D",
      }),
      "2026-11-01",
    ],
  ];
  const r = cacheRows(rows, month, "x");
  assert.deepEqual(
    r.map((x) => x.status),
    ["invalid_json", "incomplete"],
  );
  assert.ok(
    r.every((x) => x.overall_grade === null && x.followersCount === null),
  );
});
test("Sheets reader only uses fixed GET endpoints and bounds requests; malformed/failing data rejects", async () => {
  const calls = [];
  const s = createSheetReader({}, async (options) => {
    calls.push(options);
    return { data: { values: [["fixture"]] } };
  });
  assert.deepEqual(await s.rows("fixture-sheet", "'評価結果_2026-11'!A1:Z"), [
    ["fixture"],
  ]);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].retry, false);
  assert.equal(calls[0].timeout, 20000);
  assert.ok(
    calls[0].url.startsWith("https://sheets.googleapis.com/v4/spreadsheets/"),
  );
  await assert.rejects(
    createSheetReader({}, async () => ({
      data: { error: { message: "fixture" } },
    })).rows("sheet", "range"),
    /Invalid/,
  );
  await assert.rejects(
    createSheetReader({}, async () => {
      throw new Error("fixture");
    }).rows("sheet", "range"),
  );
});
test("all monthly evaluation datasets require valid month before any source read", async () => {
  const catalog = createCatalog(
      {},
      {
        rows() {
          throw new Error("unexpected IO");
        },
        titles() {
          throw new Error("unexpected IO");
        },
      },
    ),
    read = reader.createReader({ catalog, token: () => "x".repeat(40) });
  for (const dataset of ["prolevel", "youtube", "x"])
    for (const month of [undefined, "2026-13", "2026-11;DROP TABLE"])
      assert.equal(
        (
          await read({
            method: "GET",
            authorization: "Bearer " + "x".repeat(40),
            path: "/query",
            input: { dataset, month },
          })
        ).status,
        400,
      );
});
test("integration routes reject anonymous calls without constructing DB clients, and do not grant business SSO", async () => {
  const app = new Hono();
  installChatgptReadOnly(app, {});
  app.get("/api/students", (c) => c.json({ error: "SSO required" }, 401));
  assert.equal(
    (await app.request("/integrations/chatgpt/v1/catalog")).status,
    401,
  );
  assert.equal((await app.request("/api/students")).status, 401);
});
