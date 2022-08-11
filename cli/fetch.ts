#! /usr/bin/env node
import "@polkadot/api-augment";
import {
  filterBlocksByCollection,
  getLatestBlock,
  getLatestFinalizedBlock,
  prefixToArray,
} from "../src/rmrk2.0.0/tools/utils";
import fs from "fs";
import fetchRemarks from "../src/rmrk2.0.0/tools/fetchRemarks";
import arg from "arg";
import { hexToString, stringToHex } from "@polkadot/util";
import { BlockCalls } from "../src/rmrk2.0.0/tools/types";
import { VERSION } from "../src/rmrk2.0.0/tools/constants";
// @ts-ignore
import { appendPromise } from "../test/2.0.0/utils/append-json-stream";
import {
  getApiWithReconnect,
  PUBLIC_KUSAMA_WS_ENDPOINTS,
} from "../src/rmrk2.0.0/tools/get-polkadot-api-with-reconnect";
import { JsonStreamStringify } from "json-stream-stringify";

const fetch = async () => {
  const args = arg({
    // Types
    "--ws": String, // Optional websocket url
    "--backupws": String, // Optional backup websocket url
    "--append": String, // Path to append new remarks to, will auto-detect last block and use it as FROM. Overrides FROM. If file does not exist, it will be created and FROM will default to 0.
    "--from": Number, // The starting block
    "--to": Number, // The starting block
    "--prefixes": String, // Limit remarks to prefix. No default. Can be hex (0x726d726b,0x524d524b) or string (rmrk,RMRK), or combination (rmrk,0x524d524b), separate with comma for multiple
    "--output": String, // Filename to save data into, defaults to `remarks-${from}-${to}-${args["--prefixes"] || ""}.json`
    "--fin": String, // "yes" by default. If omitting `from`, will default to last finalized. If this is "no", will default to last block.
    "--collection": String, // Filter by specific collection
    "--ss58Format": Number,
  });

  console.log(args);
  const ws = args["--ws"] || "ws://127.0.0.1:9944";
  const backupws = args["--backupws"] || "ws://127.0.0.1:9944";
  const WS_ENDPOINTS =
    ws === "kusama" ? PUBLIC_KUSAMA_WS_ENDPOINTS : [ws, backupws];
  const api = await getApiWithReconnect(WS_ENDPOINTS);
  const append = args["--append"];
  console.log("Connecting to " + ws);
  let from = args["--from"] || 0;
  const output = args["--output"] || "";
  const fin = args["--fin"] || "yes";
  const collectionFilter = args["--collection"];

  const systemProperties = await api.rpc.system.properties();
  const { ss58Format: chainSs58Format } = systemProperties.toHuman();

  const ss58Format = args["--ss58Format"] || (chainSs58Format as number) || 2;

  // Grab FROM from append file
  let appendFile: any[] = [];
  if (append) {
    console.log("Will append to " + append);
    try {
      appendFile = await appendPromise(append);
      const lastBlock = appendFile.pop();
      if (lastBlock) {
        from = lastBlock.block + 1;
      }
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  }

  const latestProgrammatic =
    fin === "yes"
      ? await getLatestFinalizedBlock(api)
      : await getLatestBlock(api);

  const to =
    typeof args["--to"] === "number" ? args["--to"] : latestProgrammatic;

  if (from > to) {
    console.error("Starting block must be less than ending block.");
    process.exit(1);
  }

  //0x3a3a322e302e303a3a

  let extracted = await fetchRemarks(
    api,
    from,
    to,
    prefixToArray(args["--prefixes"] || ""),
    ss58Format
  );

  let NAcounter = 0;

  extracted = extracted.filter((remark) => {
    const filteredRemark: BlockCalls = { ...remark, calls: [] };
    if (remark && remark?.calls) {
      filteredRemark.calls = remark.calls.filter((call) => {
        if (call.value !== "0x4e41") {
          NAcounter++;
        }
        return (
          call.value !== "0x4e41" &&
          hexToString(call.value).includes(`::${VERSION}::`)
        );
      });
    }

    return filteredRemark.calls.length > 0;
  });

  if (collectionFilter) {
    extracted = filterBlocksByCollection(
      extracted,
      prefixToArray(args["--prefixes"] || ""),
      collectionFilter
    );
  }

  let outputFileName =
    output !== ""
      ? output
      : `remarks-${from}-${to}-${args["--prefixes"] || ""}.json`;
  console.log(`Will write to file ${outputFileName}`);
  if (append) {
    extracted = appendFile.concat(extracted);
    console.log(`Appending ${appendFile.length} remarks found. Full set:`);
    outputFileName = append;
  }
  extracted.push({
    block: to,
    calls: [],
  });

  //@ts-ignore
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };

  const writeStream = fs.createWriteStream(`full-${outputFileName}`, "UTF8");

  new JsonStreamStringify(extracted)
    .on("data", (chunk) => {
      writeStream.write(chunk);
    })
    .once("end", () => {
      console.log("SUCCESS writing dump");
      console.log("NA count", NAcounter);
      process.exit(0);
    })
    .once("error", (err) => {
      console.log("ERROR writing dump", err);
      process.exit(0);
    });
};

fetch();
