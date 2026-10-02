// Build a disposable local CLI workdir without copying hosted links/settings.
import fs from 'node:fs';
import path from 'node:path';
const source=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const arg=process.argv[2];
if(!arg || !path.isAbsolute(arg)) throw Error('Provide an absolute NEW disposable output directory');
const dest=path.resolve(arg);
if(dest===source || dest.startsWith(source+path.sep) || fs.existsSync(dest)) throw Error('Output must be new and outside the repository');
fs.mkdirSync(path.join(dest,'supabase'),{recursive:true});
fs.copyFileSync(path.join(source,'supabase/config.issue10-isolated.toml'),path.join(dest,'supabase/config.toml'));
fs.cpSync(path.join(source,'supabase/migrations'),path.join(dest,'supabase/migrations'),{recursive:true});
console.log(JSON.stringify({workdir:dest,signup:false,postgresMajor:17,hostedLinksCopied:false}));
