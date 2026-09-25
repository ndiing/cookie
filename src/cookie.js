/**
 * @typedef {Object} Options
 * @property {String} [tableName=cookies]
 * @property {String} [apiId=default]
 * @property {String} [sessionId=default]
 */

class Cookie {
    static attributes = {
        domain: { name: "domain", flag: false },
        expires: { name: "expires", flag: false },
        httponly: { name: "httpOnly", flag: true },
        "max-age": { name: "maxAge", flag: false },
        partitioned: { name: "partitioned", flag: true },
        path: { name: "path", flag: false },
        secure: { name: "secure", flag: true },
        samesite: { name: "sameSite", flag: false },
    };

    static prefixes = {
        // Final — RFC 6265bis
        "__Secure-": (obj) => obj.secure,
        "__Host-": (obj) => obj.secure && !obj.domain && obj.path == "/",

        // Provisional — masih draft di httpwg, nama bisa berubah
        // Refs:
        // - https://github.com/httpwg/http-extensions/pull/...
        // - Chrome 140 sudah implement, WebKit condong ke format ini
        "__Http-": (obj) => obj.secure && obj.httpOnly,
        "__Host-Http-": (obj) => obj.secure && obj.httpOnly && !obj.domain && obj.path == "/",
    };

    static attributesRegex = /([^=; ]+)(=([^;]+))?/g;

    static prefixesRegex = /(__Secure-|__Host-Http-|__Host-|__Http-)/;

    /**@type {import("@ndiinginc/dal")}*/
    db = null;
    tableName = null;
    apiId = null;
    sessionId = null;
    ensureTable = true;

    /**
     * @param {import("@ndiinginc/dal")} db
     * @param {Options} options
     */
    constructor(db, options = {}) {
        this.db = db;
        this.tableName = options.tableName ?? "cookies";
        this.apiId = options.apiId ?? "default";
        this.sessionId = options.sessionId ?? "default";
    }

    async _ensureTable(db) {
        const exists = await db.query().select().from("sqlite_master").where("type", "table").where("name", this.tableName).exists();
        if (exists) {
            return;
        }

        await db.schema().createTable(this.tableName, (table) => {
            table.column("api_id").text().notNull();
            table.column("session_id").text().notNull();
            table.column("hostname").text().notNull();
            table.column("name").text().notNull();
            table.column("value").text();
            table.column("domain").text().notNull().default("");
            table.column("expires").integer();
            table.column("httpOnly").integer().default(0);
            table.column("partitioned").integer().default(0);
            table.column("path").text().notNull().default("/");
            table.column("sameSite").text().default("lax");
            table.column("secure").integer().default(0);
            table.column("created_at").integer().default(db.raw("(unixepoch('subsec') * 1000)"));

            table.primaryKey("api_id", "session_id", "hostname", "domain", "path", "name");
            table.index().on("expires");
            table.index().on("api_id", "session_id");
        });
    }

    /**
     * @private
     * @param {Object} options
     * @property {String} options.hostname
     * @property {String} options.name
     * @property {String} [options.domain=]
     * @property {String} [options.path=/]
     */
    async _delete(options) {
        return await this.db
            .query()
            .delete(this.tableName)
            .where("api_id", this.apiId)
            .where("session_id", this.sessionId)
            .where("hostname", options.hostname)
            .where("domain", options.domain ?? "")
            .where("path", options.path ?? "/")
            .where("name", options.name);
    }

    /**
     * @private
     * @param {Object} options
     * @property {String} options.hostname
     * @property {String} options.name
     * @property {String} options.value
     * @property {String} [options.domain=]
     * @property {Number} options.expires
     * @property {Number} [options.httpOnly=0]
     * @property {Number} [options.partitioned=0]
     * @property {String} [options.path=/]
     * @property {String} [options.sameSite=lax]
     * @property {Number} [options.secure=0]
     */
    async _upsert(options) {
        options.api_id = this.apiId;
        options.session_id = this.sessionId;

        return await this.db.query().insert(this.tableName, options).onConflict("api_id", "session_id", "hostname", "domain", "path", "name").doUpdate("value", "expires", "httpOnly", "partitioned", "sameSite", "secure");
    }

    async clear() {
        if (this.ensureTable) await this._ensureTable(this.db);

        return await this.db.query().delete(this.tableName).where("api_id", this.apiId).where("session_id", this.sessionId);
    }

    async deleteExpired() {
        if (this.ensureTable) await this._ensureTable(this.db);

        return await this.db.query().delete(this.tableName).where("api_id", this.apiId).where("session_id", this.sessionId).where("expires", "is not", null).where("expires", "<=", Date.now());
    }

    /**
     * @param {URL|String} url
     */
    async get(url) {
        if (this.ensureTable) await this._ensureTable(this.db);

        const { hostname, pathname, protocol } = URL.parse(url);
        const secure = protocol === "https:" ? 1 : 0;

        // prettier-ignore
        const rows=await this.db.query()
            .select("name", "value")
            .from(this.tableName)
            .where("api_id", this.apiId)
            .where("session_id", this.sessionId)
            .where((q) => {
                q
                .where((q) => {
                    q
                    .where("domain", "")
                    .where("hostname", this.db.raw("?", [hostname]));
                })
                .orWhere((q) => {
                    q
                    .where("domain", "!=", "")
                    .where((q) => {
                        q
                        .where("domain", this.db.raw("?", [hostname]))
                        .orWhere(this.db.raw("?", [hostname]), "like", this.db.raw("'%' || domain"));
                    });
                });
            })
            .where((q) => {
                q
                .where("expires", "is", null)
                .orWhere("expires", ">", this.db.raw("?", [Date.now()]));
            })
            .where((q) => {
                q
                .where("path", this.db.raw("?", [pathname]))
                .orWhere((q) => {
                    q
                    .where((q) => {
                        q
                        .where("path", "like", "%/")
                        .where(this.db.raw("?", [pathname]), "like", this.db.raw("path || '%'"));
                    })
                    .orWhere((q) => {
                        q
                        .where("path", "not like", "%/")
                        .where(this.db.raw("?", [pathname]), "like", this.db.raw("path || '/%'"));
                    });
                });
            })
            .where((q) => {
                q
                .where("secure", 0)
                .orWhere(this.db.raw("?", [secure ? 1 : 0]), 1);
            })
            .orderBy("LENGTH(path)", "DESC")
            .orderBy("created_at", "ASC");

        return rows.map(({ name, value }) => [name, value].join("=")).join("; ");
    }

    /**
     * @param {URL|String} url
     * @param {String} str
     */
    async set(url, str) {
        if (this.ensureTable) await this._ensureTable(this.db);

        const arr = Array.isArray(str) ? str : [str];
        for (const str of arr) {
            const obj = {};

            for (const match of str.matchAll(Cookie.attributesRegex)) {
                const [, name, , value] = match;

                const attr = Cookie.attributes[name.toLowerCase()];
                if (attr && (!attr.flag || (attr.flag && !value))) {
                    obj[attr.name] = attr.flag ? 1 : value;
                } else {
                    obj.name = name;
                    obj.value = value;
                }
            }

            if (obj.expires) {
                const parsed = Date.parse(obj.expires);
                obj.expires = isNaN(parsed) ? null : parsed;
            }

            if (obj.maxAge) {
                const maxAge = parseInt(obj.maxAge);
                obj.expires = maxAge <= 0 ? 0 : Date.now() + maxAge * 1000;
                delete obj.maxAge;
            }

            const { hostname, pathname } = URL.parse(url);
            obj.hostname = hostname;

            if (!obj.path) {
                obj.path = pathname.replace(/\/$/, "").split("/").slice(0, -1).join("/") || "/";
            }

            const prefix = obj.name.match(Cookie.prefixesRegex)?.[0];
            if (prefix && !Cookie.prefixes[prefix](obj)) {
                continue;
            }

            if (obj.expires !== null && Date.now() > obj.expires) {
                await this._delete(obj);
            } else {
                await this._upsert(obj);
            }
        }
    }
}

module.exports = Cookie;
