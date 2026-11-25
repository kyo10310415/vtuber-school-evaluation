import { GoogleAuth } from "google-auth-library";
export function createSheetReader(env = process.env, request) {
  let clientPromise;
  const pending = new Map();
  async function get(path) {
    if (pending.has(path)) return pending.get(path);
    const work = (async () => {
      if (!request) {
        clientPromise ??= new GoogleAuth({
          credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT),
          scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
        }).getClient();
      }
      const options = {
        url: "https://sheets.googleapis.com/v4/spreadsheets/" + path,
        method: "GET",
        timeout: 20000,
        retry: false,
        maxContentLength: 8 * 1024 * 1024,
      };
      const response = await (request
        ? request(options)
        : (await clientPromise).request(options));
      return response.data;
    })();
    pending.set(path, work);
    try {
      return await work;
    } finally {
      pending.delete(path);
    }
  }
  return {
    async titles(id) {
      if (!id) throw new Error("Sheet is not configured");
      const data = await get(
        encodeURIComponent(id) + "?fields=sheets.properties.title",
      );
      if (!Array.isArray(data?.sheets))
        throw new Error("Invalid sheet metadata");
      return data.sheets
        .map((s) => s.properties?.title)
        .filter((x) => typeof x === "string");
    },
    async rows(id, range) {
      if (!id) throw new Error("Sheet is not configured");
      const data = await get(
        encodeURIComponent(id) + "/values/" + encodeURIComponent(range),
      );
      if (data?.values === undefined && typeof data?.range === "string")
        return [];
      if (
        !Array.isArray(data?.values) ||
        data.values.some(
          (r) =>
            !Array.isArray(r) ||
            r.some(
              (v) =>
                v !== null &&
                !["string", "number", "boolean"].includes(typeof v),
            ),
        )
      )
        throw new Error("Invalid sheet rows");
      return data.values;
    },
  };
}
