const Database = require("@ndiinginc/dal");
const Cookie = require("../src/cookie");

const db = new Database({
    client: "better-sqlite3",
    connection: { database: "./test.db" },
    // debug: true,
});
const cookie = new Cookie(db, {
    apiId: "default",
    sessionId: "default",
});

describe("cookie", () => {
    beforeAll(async () => {
        await cookie.clear();
    });

    test("set cookie", async () => {
        const url = "http://localhost";
        await cookie.set(url, "name=value");
        const result = await cookie.get(url);
        expect(result).toBe("name=value");
    });

    test("delete cookie with max-age", async () => {
        const url = "http://localhost";
        await cookie.set(url, "name=value; max-age=0");
        const result = await cookie.get(url);
        expect(result).toBe("");
    });

    test("set cookie", async () => {
        const url = "http://localhost";
        await cookie.set(url, "name=value");
        const result = await cookie.get(url);
        expect(result).toBe("name=value");
    });

    test("delete cookie with expires", async () => {
        const url = "http://localhost";
        const date = new Date(0).toUTCString();
        await cookie.set(url, "name=value; expires=" + date);
        const result = await cookie.get(url);
        expect(result).toBe("");
    });

    test("set cookie", async () => {
        const url = "https://example.com/api/api_id/session_id/method";

        await cookie.set(url, "sessionId=38afes7a8");
        await cookie.set(url, "id=a3fWa; Expires=Wed, 21 Oct 2015 07:28:00 GMT");
        await cookie.set(url, "id=a3fWa; Max-Age=2592000");
        await cookie.set(url, "qwerty=219ffwef9w0f; Domain=some-company.co.uk");
        await cookie.set(url, "sessionId=e8bb43229de9; Domain=foo.example.com");
        await cookie.set(url, "__Secure-ID=123; Secure; Domain=example.com");
        await cookie.set(url, "__Host-ID=123; Secure; Path=/");
        await cookie.set(url, "__Secure-id=1");
        await cookie.set(url, "__Host-id=1; Secure");
        await cookie.set(url, "__Host-id=1; Secure; Path=/; Domain=example.com");
        await cookie.set(url, "__Http-ID=123; Secure; Domain=example.com");
        await cookie.set(url, "__Host-Http-ID=123; Secure; Path=/");
        await cookie.set(url, "__Host-example=34d8g; SameSite=None; Secure; Path=/; Partitioned;");

        const result = await cookie.get(url);
        expect(result).toBe("sessionId=38afes7a8; id=a3fWa; __Secure-ID=123; __Host-ID=123; __Host-example=34d8g");
    });
});
