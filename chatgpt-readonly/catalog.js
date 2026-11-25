import { createSheetReader } from "./google-reader.js";
import { isFallbackProLevelComment } from "../src/lib/evaluation.ts";
const text = (value) =>
  value === null || value === undefined || value === "" ? null : String(value);
const number = (value) =>
  value === null ||
  value === undefined ||
  typeof value === "boolean" ||
  String(value).trim() === "" ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
const grade = (value) =>
  ["S", "A", "B", "C", "D"].includes(value) ? value : null;
const fields = (type, names) =>
  Object.fromEntries(names.map((name) => [name, type]));
function table(rows, required) {
  if (!rows.length) throw new Error("Sheet headers are missing");
  const headers = rows[0].map(String);
  for (const name of required)
    if (
      !headers.includes(name) ||
      headers.indexOf(name) !== headers.lastIndexOf(name)
    )
      throw new Error("Sheet headers are missing or ambiguous");
  return {
    rows: rows.slice(1),
    value: (row, ...names) => {
      const i = names.map((n) => headers.indexOf(n)).find((i) => i >= 0);
      return i === undefined ? null : (row[i] ?? null);
    },
  };
}
export function prolevelRows(rows, month) {
  const t = table(rows, ["学籍番号", "総合評価"]),
    latest = new Map();
  for (let i = t.rows.length - 1; i >= 0; i--) {
    const row = t.rows[i],
      id = text(t.value(row, "学籍番号")),
      comment = t.value(row, "コメント", "評価コメント");
    if (!id || latest.has(id) || isFallbackProLevelComment(comment)) continue;
    latest.set(id, {
      student_id: id,
      name: text(t.value(row, "氏名", "生徒名")),
      month,
      overall_grade: grade(t.value(row, "総合評価")),
      absence_grade: grade(t.value(row, "欠席", "欠席評価")),
      lateness_grade: grade(t.value(row, "遅刻", "遅刻評価")),
      attendance_grade: grade(t.value(row, "欠席・遅刻評価")),
      mission_grade: grade(t.value(row, "ミッション", "ミッション評価")),
      payment_grade: grade(t.value(row, "支払い", "支払い評価")),
      listening_grade: grade(
        t.value(row, "アクティブリスニング", "傾聴力評価"),
      ),
      comprehension_grade: grade(t.value(row, "理解度", "理解度評価")),
      comments: text(comment),
      evaluated_at: text(t.value(row, "評価日時")),
    });
  }
  return [...latest.values()];
}
const youtubeNumbers = [
  "subscriberCount",
  "subscriberGrowthRate",
  "totalViews",
  "videosInMonth",
  "weeklyStreamCount",
  "averageStreamDuration",
  "totalLikes",
  "totalComments",
  "engagementRate",
];
const youtubeBooleans = [
  "meetsWeekly4StreamsGoal",
  "meetsMinimum90MinutesGoal",
];
const xNumbers = [
  "followersCount",
  "followingCount",
  "followerGrowthRate",
  "dailyFollows",
  "tweetsInMonth",
  "dailyTweetCount",
  "weeklyPlanningTweets",
  "totalLikes",
  "totalRetweets",
  "totalReplies",
  "totalImpressions",
  "engagementRate",
  "engagementGrowthRate",
  "impressionGrowthRate",
];
const xBooleans = [
  "meetsDailyFollowGoal",
  "meetsDailyTweetGoal",
  "meetsWeeklyPlanningGoal",
];
export function cacheRows(rows, month, type) {
  const t = table(rows, ["学籍番号", "評価月", "評価データ"]),
    groups = new Map();
  for (const row of t.rows) {
    if (t.value(row, "評価月") !== month) continue;
    const id = text(t.value(row, "学籍番号"));
    if (!id) continue;
    const base = {
      student_id: id,
      name: text(t.value(row, "生徒名", "氏名")),
      month,
      cached_at: text(t.value(row, "キャッシュ日時")),
    };
    const group = groups.get(id) || {};
    let data,
      status = "stored";
    try {
      data = JSON.parse(t.value(row, "評価データ"));
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error();
      if (
        type === "youtube"
          ? data.videosInMonth === 0 ||
            data.subscriberCount === 0 ||
            data.totalViews === 0
          : data.tweetsInMonth === 0 && data.followersCount === 0
      )
        status = "incomplete";
    } catch {
      status = "invalid_json";
      data = null;
    }
    const candidate = { ...base, status, data };
    const newer = (old) =>
      !old || !old.cached_at || String(base.cached_at || "") > old.cached_at;
    if (newer(group.last)) group.last = candidate;
    if (status === "stored" && newer(group.good)) group.good = candidate;
    groups.set(id, group);
  }
  return [...groups.values()].map((g) => {
    const chosen = g.good || g.last,
      data = g.good?.data || {};
    const result = {
      student_id: chosen.student_id,
      name: chosen.name,
      month,
      cached_at: chosen.cached_at,
      status: chosen.status,
      overall_grade: grade(data.overallGrade),
    };
    for (const key of type === "youtube" ? youtubeNumbers : xNumbers)
      result[key] = number(data[key]);
    for (const key of type === "youtube" ? youtubeBooleans : xBooleans)
      result[key] = typeof data[key] === "boolean" ? data[key] : null;
    if (type === "youtube") {
      result.titleQuality = text(data.titleQuality);
      result.thumbnailQuality = text(data.thumbnailQuality);
    }
    return result;
  });
}
const analyticMetrics = [
  "views",
  "likes",
  "comments",
  "shares",
  "watch_time_minutes",
  "avg_view_duration",
  "avg_view_percentage",
  "subscribers_gained",
  "subscribers_lost",
].flatMap((metric) =>
  ["shorts", "regular", "live"].map((type) => type + "_" + metric),
);
export function createCatalog(
  env = process.env,
  sheets = createSheetReader(env),
) {
  const resultSheet = () => env.RESULT_SPREADSHEET_ID;
  const cache = (type, numbers, booleans) => ({
    title: `評価システム：${type === "youtube" ? "YouTube" : "X"}の保存済み月次評価。既存画面と同じ最新の完全キャッシュを優先。statusがstored以外は評価未取得`,
    requiresMonth: true,
    history: "snapshot",
    fields: {
      ...fields("text", [
        "student_id",
        "name",
        "month",
        "cached_at",
        "status",
        "overall_grade",
        ...(type === "youtube" ? ["titleQuality", "thumbnailQuality"] : []),
      ]),
      ...fields("number", numbers),
      ...fields("boolean", booleans),
    },
    async load(_db, { month }) {
      return cacheRows(
        await sheets.rows(resultSheet(), `'${type}_cache'!A1:F`),
        month,
        type,
      );
    },
  });
  return {
    students: {
      title: "評価システム：生徒マスターの現在値",
      history: "current",
      fields: fields("text", [
        "student_id",
        "name",
        "plan",
        "status",
        "youtube_channel_id",
        "x_account",
      ]),
      async load() {
        const rows = await sheets.rows(
          env.STUDENT_MASTER_SPREADSHEET_ID,
          "'リスト'!A2:G",
        );
        return rows
          .filter((r) => r[0] || r[1])
          .map((r) => ({
            student_id: text(r[1]),
            name: text(r[0]),
            plan: text(r[2]),
            status: text(r[3]),
            youtube_channel_id: text(r[5]),
            x_account: text(r[6]),
          }));
      },
    },
    months: {
      title:
        "評価システム：プロレベルの月次結果シート一覧。SNSのみ保存された月は含まない",
      history: "current",
      fields: fields("text", ["month"]),
      async load() {
        return (await sheets.titles(resultSheet()))
          .filter((t) => /^評価結果_\d{4}-(0[1-9]|1[0-2])$/.test(t))
          .sort()
          .map((t) => ({ month: t.slice("評価結果_".length) }));
      },
    },
    prolevel: {
      title:
        "評価システム：指定月の最新有効プロレベル評価。失敗コメントを除外。S〜Dは順序尺度であり平均点に自動変換しない。欠席・遅刻の合算欄と個別欄は別項目",
      history: "snapshot",
      requiresMonth: true,
      fields: fields("text", [
        "student_id",
        "name",
        "month",
        "overall_grade",
        "absence_grade",
        "lateness_grade",
        "attendance_grade",
        "mission_grade",
        "payment_grade",
        "listening_grade",
        "comprehension_grade",
        "comments",
        "evaluated_at",
      ]),
      async load(_db, { month }) {
        return prolevelRows(
          await sheets.rows(resultSheet(), `'評価結果_${month}'!A1:Z`),
          month,
        );
      },
    },
    youtube: cache("youtube", youtubeNumbers, youtubeBooleans),
    x: cache("x", xNumbers, xBooleans),
    analytics: {
      title:
        "評価システム：保存済みYouTube Analytics期間集計。期間の重なり・平均値の単純合計に注意。新規取得は行わない",
      history: "snapshot",
      fields: {
        ...fields("text", [
          "student_id",
          "channel_id",
          "period_start",
          "period_end",
          "created_at",
          "updated_at",
        ]),
        ...fields("number", ["id", ...analyticMetrics]),
      },
      order: ["id"],
      sql: `SELECT id,student_id,channel_id,to_char(period_start,'YYYY-MM-DD') AS period_start,to_char(period_end,'YYYY-MM-DD') AS period_end,${analyticMetrics.join(",")},created_at,updated_at FROM analytics_history`,
    },
  };
}
