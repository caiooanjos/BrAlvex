// Localiza um PHP para desenvolvimento, testes e empacotamento. No Windows, baixa uma versão portátil oficial
// (windows.php.net) para .cache/php na primeira vez. Em produção quem executa o PHP é a hospedagem.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "php");
const WINDOWS_RELEASES = "https://windows.php.net/downloads/releases/";

function works(bin) {
  const r = spawnSync(bin, ["-r", 'echo PHP_VERSION, "|", extension_loaded("pdo_mysql") ? 1 : 0, "|", extension_loaded("mbstring") ? 1 : 0;'], {
    encoding: "utf8",
  });
  if (r.status !== 0) return false;
  const [version, pdo, mb] = r.stdout.trim().split("|");
  return version.localeCompare("8.1", undefined, { numeric: true }) >= 0 && pdo === "1" && mb === "1";
}

async function downloadWindowsPhp() {
  console.log("PHP não encontrado. Baixando PHP 8.3 portátil (cerca de 30 MB) para .cache/php ...");
  const headers = { "user-agent": "Mozilla/5.0 (bralvex-dev)" };
  const listing = await (await fetch(WINDOWS_RELEASES, { headers })).text();
  const names = [...listing.matchAll(/php-8\.3\.\d+(?:-\d+)?-nts-Win32-vs16-x64\.zip/g)].map((m) => m[0]);
  const latest = [...new Set(names)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  if (!latest) throw new Error("Não foi possível localizar o PHP 8.3 em windows.php.net.");
  await rm(CACHE, { recursive: true, force: true });
  await mkdir(CACHE, { recursive: true });
  const zip = join(CACHE, latest);
  const res = await fetch(WINDOWS_RELEASES + latest, { headers });
  if (!res.ok) throw new Error(`Falha ao baixar ${latest} (HTTP ${res.status}).`);
  await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  // tar.exe do Windows (bsdtar) extrai zip; o tar do Git Bash não.
  const systemTar = join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  const tar = spawnSync(existsSync(systemTar) ? systemTar : "tar", ["-xf", zip, "-C", CACHE], { stdio: "inherit" });
  if (tar.status !== 0) throw new Error("Falha ao extrair o PHP.");
  await rm(zip);
  const ext = join(CACHE, "ext").replace(/\\/g, "/");
  await writeFile(
    join(CACHE, "php.ini"),
    `extension_dir = "${ext}"\nextension=pdo_mysql\nextension=mbstring\nextension=openssl\nextension=sodium\nmemory_limit = 256M\n`,
  );
}

let cached;
/** Caminho de um PHP 8.1+ com pdo_mysql e mbstring. */
export async function findPhp() {
  if (cached) return cached;
  const local = join(CACHE, process.platform === "win32" ? "php.exe" : "php");
  for (const bin of [process.env.PHP_BINARY, local, "php"].filter(Boolean)) {
    if ((bin === local ? existsSync(local) : true) && works(bin)) return (cached = bin);
  }
  if (process.platform === "win32") {
    await downloadWindowsPhp();
    if (works(local)) return (cached = local);
  }
  throw new Error("PHP 8.1+ com pdo_mysql e mbstring não encontrado. Instale o PHP ou defina PHP_BINARY.");
}

export async function freePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolvePort(port));
    });
  });
}

/** Executa php/app/cli.php com o ambiente informado. */
export async function phpCli(args, { env = {}, input } = {}) {
  const php = await findPhp();
  return spawnSync(php, [join(ROOT, "php", "app", "cli.php"), ...args], {
    encoding: "utf8",
    input,
    env: { ...process.env, ...env },
  });
}

/** Sobe o servidor embutido do PHP com o roteador que reproduz o .htaccess de produção. */
export async function startPhpServer(env, { port, host = "127.0.0.1", inherit = false } = {}) {
  const php = await findPhp();
  port ??= await freePort();
  const child = spawn(php, ["-S", `${host}:${port}`, join(ROOT, "php", "dev-router.php")], {
    cwd: ROOT,
    env: { ...process.env, BRALVEX_PUBLIC_DIR: join(ROOT, "dist"), ...env },
    stdio: inherit ? "inherit" : "ignore",
  });
  const base = `http://${host}:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error("O servidor PHP encerrou ao iniciar.");
    try {
      await fetch(`${base}/404.html`);
      return { base, port, child, stop: () => child.kill() };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  child.kill();
  throw new Error("O servidor PHP não respondeu.");
}
