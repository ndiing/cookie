# @ndiinginc/cookie

Cookie jar berbasis database (SQLite via `@ndiinginc/dal`) untuk menyimpan, mengambil, dan mengelola cookie secara persisten — cocok dipakai bareng HTTP client custom / reverse-engineered API yang butuh cookie jar layaknya browser (mendukung `domain`, `path`, `expires`, `secure`, `httpOnly`, `sameSite`, `partitioned`, dan cookie prefix `__Secure-` / `__Host-`).

## Instalasi

```bash
npm install @ndiinginc/cookie
```

> Membutuhkan `@ndiinginc/dal` sebagai koneksi database (peer dependency).

## Fitur

- Parsing `Set-Cookie` string (mendukung multiple cookies sekaligus)
- Matching cookie ke request berdasarkan `domain`, `path`, dan `secure`
- Auto-handle `Max-Age` → `expires`
- Auto-hapus cookie yang sudah expired saat `set()`
- Validasi cookie prefix (`__Secure-`, `__Host-`, serta draft `__Http-` / `__Host-Http-`)
- Multi-tenant: isolasi data per `apiId` dan `sessionId` dalam satu tabel
- Auto-create tabel saat pertama kali dipakai

## Penggunaan

```js
const Cookie = require("@ndiinginc/cookie");
const db = require("@ndiinginc/dal")(/* konfigurasi db */);

const cookie = new Cookie(db, {
    tableName: "cookies", // opsional, default: "cookies"
    apiId: "my-api",      // opsional, default: "default"
    sessionId: "user-123",// opsional, default: "default"
});

// Simpan cookie dari response header Set-Cookie
await cookie.set(
    "https://example.com/login",
    "session=abc123; Path=/; HttpOnly; Secure; Max-Age=3600"
);

// Ambil cookie header untuk request berikutnya
const cookieHeader = await cookie.get("https://example.com/dashboard");
// -> "session=abc123"

// Hapus semua cookie yang sudah expired
await cookie.deleteExpired();

// Hapus semua cookie untuk apiId + sessionId ini
await cookie.clear();
```

### Menyimpan banyak cookie sekaligus

`set()` menerima string tunggal atau array string (misalnya dari header `Set-Cookie` yang berupa array):

```js
await cookie.set(url, [
    "a=1; Path=/",
    "b=2; Path=/; Secure",
]);
```

## API

### `new Cookie(db, options?)`

| Parameter | Tipe | Default | Keterangan |
|---|---|---|---|
| `db` | `DAL` | — | Instance koneksi database dari `@ndiinginc/dal` |
| `options.tableName` | `string` | `"cookies"` | Nama tabel penyimpanan cookie |
| `options.apiId` | `string` | `"default"` | Namespace/ID API untuk isolasi data |
| `options.sessionId` | `string` | `"default"` | ID sesi untuk isolasi data |

### `cookie.set(url, str)`

Mem-parsing dan menyimpan cookie dari string `Set-Cookie` (atau array string) untuk `url` yang diberikan. Cookie yang sudah expired otomatis dihapus alih-alih disimpan.

- `url` — `URL | string`, URL asal cookie (dipakai untuk menentukan `hostname` dan default `path`)
- `str` — `string | string[]`, isi header `Set-Cookie`

### `cookie.get(url)`

Mengembalikan `string` cookie header (format `"name=value; name2=value2"`) yang cocok untuk request ke `url` tersebut, berdasarkan `domain`, `path`, `secure`, dan tanggal expired.

### `cookie.deleteExpired()`

Menghapus semua cookie yang sudah lewat masa berlakunya (untuk `apiId` + `sessionId` saat ini).

### `cookie.clear()`

Menghapus seluruh cookie untuk `apiId` + `sessionId` saat ini.

## Skema tabel

Tabel dibuat otomatis (jika belum ada) dengan kolom berikut:

| Kolom | Tipe | Keterangan |
|---|---|---|
| `api_id` | text | bagian dari primary key |
| `session_id` | text | bagian dari primary key |
| `hostname` | text | host asal cookie |
| `name` | text | nama cookie |
| `value` | text | nilai cookie |
| `domain` | text | atribut `Domain` (default `""`) |
| `expires` | integer | epoch ms, `null` jika session cookie |
| `httpOnly` | integer | 0/1 |
| `partitioned` | integer | 0/1 |
| `path` | text | atribut `Path` (default `"/"`) |
| `sameSite` | text | default `"lax"` |
| `secure` | integer | 0/1 |
| `created_at` | integer | epoch ms saat insert |

Primary key: `(api_id, session_id, hostname, domain, path, name)`.

## Cookie prefix yang didukung

- `__Secure-` — wajib `Secure`
- `__Host-` — wajib `Secure`, tanpa `Domain`, `Path=/`
- `__Http-` *(draft)* — wajib `Secure` + `HttpOnly`
- `__Host-Http-` *(draft)* — gabungan aturan `__Host-` dan `__Http-`

Cookie dengan prefix yang tidak memenuhi aturan di atas akan otomatis di-skip (tidak disimpan).

## Lisensi

ISC (sesuaikan dengan `package.json`)
