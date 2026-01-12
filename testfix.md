PS C:\Users\hp\Desktop\oslrs-main> cd .\docker\
PS C:\Users\hp\Desktop\oslrs-main\docker> docker compose up
time="2026-01-12T04:07:12+01:00" level=warning msg="The \"DATABASE_URL\" variable is not set. Defaulting to a blank string."
[+] Running 5/5
 ✔ Network docker_default         Created                                                                                    0.0s 
 ✔ Container docker-postgres-1    Created                                                                                    0.1s 
 ✔ Container docker-redis-1       Created                                                                                    0.1s 
 ✔ Container docker-custom-app-1  Created                                                                                    0.2s 
 ✔ Container docker-web-app-1     Created                                                                                    0.1s 
Attaching to custom-app-1, postgres-1, redis-1, web-app-1
redis-1  | 1:C 12 Jan 2026 03:07:14.017 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo
redis-1  | 1:C 12 Jan 2026 03:07:14.017 * Redis version=7.4.7, bits=64, commit=00000000, modified=0, pid=1, just started
redis-1  | 1:C 12 Jan 2026 03:07:14.017 # Warning: no config file specified, using the default config. In order to specify a config file use redis-server /path/to/redis.conf
redis-1  | 1:M 12 Jan 2026 03:07:14.018 * monotonic clock: POSIX clock_gettime
redis-1  | 1:M 12 Jan 2026 03:07:14.019 * Running mode=standalone, port=6379.
redis-1  | 1:M 12 Jan 2026 03:07:14.020 * Server initialized
redis-1  | 1:M 12 Jan 2026 03:07:14.020 * Ready to accept connections tcp                                                         
postgres-1  |                                                                                                                     
postgres-1  | PostgreSQL Database directory appears to contain a database; Skipping initialization
postgres-1  |                                                                                                                     
postgres-1  | 2026-01-12 03:07:14.160 UTC [1] LOG:  starting PostgreSQL 15.15 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
postgres-1  | 2026-01-12 03:07:14.160 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
postgres-1  | 2026-01-12 03:07:14.160 UTC [1] LOG:  listening on IPv6 address "::", port 5432                                     
postgres-1  | 2026-01-12 03:07:14.169 UTC [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"                  
postgres-1  | 2026-01-12 03:07:14.183 UTC [28] LOG:  database system was shut down at 2026-01-12 03:05:11 UTC
postgres-1  | 2026-01-12 03:07:14.192 UTC [1] LOG:  database system is ready to accept connections                                
web-app-1   | /docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
web-app-1   | /docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
web-app-1   | /docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh                               
web-app-1   | 10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf                       
web-app-1   | 10-listen-on-ipv6-by-default.sh: info: Enabled listen on IPv6 in /etc/nginx/conf.d/default.conf
web-app-1   | /docker-entrypoint.sh: Sourcing /docker-entrypoint.d/15-local-resolvers.envsh
web-app-1   | /docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh                                   
web-app-1   | /docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh                                   
web-app-1   | /docker-entrypoint.sh: Configuration complete; ready for start up
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: using the "epoll" event method                                                    
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: nginx/1.29.4
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: built by gcc 15.2.0 (Alpine 15.2.0)                                               
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: OS: Linux 6.6.87.2-microsoft-standard-WSL2
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: getrlimit(RLIMIT_NOFILE): 1048576:1048576                                         
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: start worker processes                                                            
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: start worker process 31
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: start worker process 32                                                           
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: start worker process 33                                                           
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: start worker process 34                                                           
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: start worker process 35
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: start worker process 36                                                           
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: start worker process 37                                                           
web-app-1   | 2026/01/12 03:07:14 [notice] 1#1: start worker process 38
custom-app-1  | file:///app/dist/db/index.js:8                                                                                    
custom-app-1  |     throw new Error('DATABASE_URL is not set in environment variables');
custom-app-1  |           ^                                                                                                       
custom-app-1  | 
custom-app-1  | Error: DATABASE_URL is not set in environment variables                                                           
custom-app-1  |     at file:///app/dist/db/index.js:8:11                                                                          
custom-app-1  |     at ModuleJob.run (node:internal/modules/esm/module_job:325:25)                                                
custom-app-1  |     at async ModuleLoader.import (node:internal/modules/esm/loader:606:24)                                        
custom-app-1  |     at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)                               
custom-app-1  |                                                                                                                   
custom-app-1  | Node.js v20.19.6
custom-app-1 exited with code 1
