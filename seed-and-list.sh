 yarn cli:seed --command eggmachine && yarn cli:fetch --prefixes=rmrk,RMRK --output=dump-with-eggs.json --fin no && yarn cli:seed --command egglist &&  yarn cli:fetch --prefixes=rmrk,RMRK --append=dump-with-eggs.json --fin no && yarn cli:consolidate --json=dump-with-eggs.json
