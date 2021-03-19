import JsonAdapter from "./adapters/json";
import { Collection as C100 } from "../../rmrk1.0.0/classes/collection";
import { NFT as N100 } from "../../rmrk1.0.0/classes/nft";
import { ChangeIssuer } from "../../rmrk1.0.0/classes/changeissuer";
import { Send } from "../../rmrk1.0.0/classes/send";
import { List } from "../../rmrk1.0.0/classes/list";
import { Buy } from "../../rmrk1.0.0/classes/buy";
import { Consume } from "../../rmrk1.0.0/classes/consume";
import { Emote } from "../../rmrk1.0.0/classes/emote";
import { Change } from "../../rmrk1.0.0/changelog";
import { deeplog } from "../utils";
import { Remark } from "./remark";
import { OP_TYPES } from "../constants";
import { BlockCall, Interaction } from "../types";
import { interactionBuy } from "./interactions/buy";
import { getCollectionFromRemark, validateMintIds } from "./interactions/mint";
import {
  changeIssuerInteraction,
  getChangeIssuerEntity,
} from "./interactions/changeIssuer";

export type ConsolidatorReturnType = {
  nfts: N100[];
  collections: C100[];
  invalid: InvalidCall[];
};

export class Consolidator {
  private adapter?: JsonAdapter;
  private invalidCalls: InvalidCall[];
  private collections: C100[];
  private nfts: N100[];
  constructor(initializedAdapter?: JsonAdapter) {
    if (initializedAdapter) {
      this.adapter = initializedAdapter;
    }

    this.invalidCalls = [];
    this.collections = [];
    this.nfts = [];
  }
  private findExistingCollection(id: string) {
    return this.collections.find((el) => el.id === id);
  }
  private findExistingNFT(interaction: Interaction): N100 | undefined {
    return this.nfts.find((el) => {
      const idExpand1 = el.getId().split("-");
      idExpand1.shift();
      const uniquePart1 = idExpand1.join("-");

      const idExpand2 = interaction.id.split("-");
      idExpand2.shift();
      const uniquePart2 = idExpand2.join("-");

      return uniquePart1 === uniquePart2;
    });
  }
  private updateInvalidCalls(op_type: OP_TYPES, remark: Remark) {
    const invalidCallBase: Partial<InvalidCall> = {
      op_type,
      block: remark.block,
      caller: remark.caller,
    };
    return function update(
      this: Consolidator,
      object_id: string,
      message: string
    ) {
      this.invalidCalls.push({
        ...invalidCallBase,
        object_id,
        message,
      } as InvalidCall);
    };
  }
  private mint(remark: Remark): boolean {
    // A new collection was created
    console.log("Instantiating collection");
    const invalidate = this.updateInvalidCalls(OP_TYPES.MINT, remark).bind(
      this
    );

    let collection;
    try {
      collection = getCollectionFromRemark(remark);
    } catch (e) {
      invalidate(remark.remark, e.message);
      return true;
    }

    if (this.findExistingCollection(collection.id)) {
      invalidate(
        collection.id,
        `[${OP_TYPES.MINT}] Attempt to mint already existing collection`
      );
      return true;
    }

    try {
      validateMintIds(collection, remark);
    } catch (e) {
      invalidate(collection.id, e.message);
      return true;
    }

    this.collections.push(collection);
    return false;
  }

  private mintNFT(remark: Remark): boolean {
    // A new NFT was minted into a collection
    console.log("Instantiating nft");
    const invalidate = this.updateInvalidCalls(OP_TYPES.MINTNFT, remark).bind(
      this
    );
    const n = N100.fromRemark(remark.remark, remark.block);

    if (typeof n === "string") {
      invalidate(
        remark.remark,
        `[${OP_TYPES.MINTNFT}] Dead before instantiation: ${n}`
      );
      return true;
    }

    const nftParent = this.findExistingCollection(n.collection);
    if (!nftParent) {
      invalidate(
        n.getId(),
        `NFT referencing non-existant parent collection ${n.collection}`
      );
      return true;
    }

    n.owner = nftParent.issuer;
    if (remark.caller != n.owner) {
      invalidate(
        n.getId(),
        `Attempted issue of NFT in non-owned collection. Issuer: ${nftParent.issuer}, caller: ${remark.caller}`
      );
      return true;
    }

    const existsCheck = this.nfts.find((el) => {
      const idExpand1 = el.getId().split("-");
      idExpand1.shift();
      const uniquePart1 = idExpand1.join("-");

      const idExpand2 = n.getId().split("-");
      idExpand2.shift();
      const uniquePart2 = idExpand2.join("-");

      return uniquePart1 === uniquePart2;
    });

    if (existsCheck) {
      invalidate(
        n.getId(),
        `[${OP_TYPES.MINTNFT}] Attempt to mint already existing NFT`
      );
      return true;
    }
    if (n.owner === "") {
      invalidate(
        n.getId(),
        `[${OP_TYPES.MINTNFT}] Somehow this NFT still doesn't have an owner.`
      );
      return true;
    }
    this.nfts.push(n);
    return false;
  }

  private send(remark: Remark): boolean {
    // An NFT was sent to a new owner
    console.log("Instantiating send");
    const send = Send.fromRemark(remark.remark);
    const invalidate = this.updateInvalidCalls(OP_TYPES.SEND, remark).bind(
      this
    );
    if (typeof send === "string") {
      invalidate(
        remark.remark,
        `[${OP_TYPES.SEND}] Dead before instantiation: ${send}`
      );
      return true;
    }

    const nft = this.findExistingNFT(send);
    if (!nft) {
      invalidate(
        send.id,
        `[${OP_TYPES.SEND}] Attempting to send non-existant NFT ${send.id}`
      );
      return true;
    }

    if (nft.burned != "") {
      invalidate(
        send.id,
        `[${OP_TYPES.SEND}] Attempting to send burned NFT ${send.id}`
      );
      return true;
    }

    // Check if allowed to issue send - if owner == caller
    if (nft.owner != remark.caller) {
      invalidate(
        send.id,
        `[${OP_TYPES.SEND}] Attempting to send non-owned NFT ${send.id}, real owner: ${nft.owner}`
      );
      return true;
    }

    if (nft.transferable === 0 || nft.transferable >= remark.block) {
      invalidate(
        send.id,
        `[${OP_TYPES.SEND}] Attempting to send non-transferable NFT ${send.id}.`
      );
      return true;
    }

    nft.addChange({
      field: "owner",
      old: nft.owner,
      new: send.recipient,
      caller: remark.caller,
      block: remark.block,
    } as Change);

    nft.owner = send.recipient;

    // Cancel LIST, if any
    if (nft.forsale > BigInt(0)) {
      nft.addChange({
        field: "forsale",
        old: nft.forsale,
        new: BigInt(0),
        caller: remark.caller,
        block: remark.block,
      } as Change);
      nft.forsale = BigInt(0);
    }

    return false;
  }

  private list(remark: Remark): boolean {
    // An NFT was listed for sale
    console.log("Instantiating list");
    const list = List.fromRemark(remark.remark);
    const invalidate = this.updateInvalidCalls(OP_TYPES.LIST, remark).bind(
      this
    );

    if (typeof list === "string") {
      invalidate(
        remark.remark,
        `[${OP_TYPES.LIST}] Dead before instantiation: ${list}`
      );
      return true;
    }

    // Find the NFT in question
    const nft = this.findExistingNFT(list);

    if (!nft) {
      invalidate(
        list.id,
        `[${OP_TYPES.LIST}] Attempting to list non-existant NFT ${list.id}`
      );
      return true;
    }

    if (nft.burned != "") {
      invalidate(
        list.id,
        `[${OP_TYPES.LIST}] Attempting to list burned NFT ${list.id}`
      );
      return true;
    }

    // Check if allowed to issue send - if owner == caller
    if (nft.owner != remark.caller) {
      invalidate(
        list.id,
        `[${OP_TYPES.LIST}] Attempting to list non-owned NFT ${list.id}, real owner: ${nft.owner}`
      );
      return true;
    }

    if (nft.transferable === 0 || nft.transferable >= remark.block) {
      invalidate(
        list.id,
        `[${OP_TYPES.LIST}] Attempting to list non-transferable NFT ${list.id}.`
      );
      return true;
    }

    if (list.price !== nft.forsale) {
      nft.addChange({
        field: "forsale",
        old: nft.forsale,
        new: list.price,
        caller: remark.caller,
        block: remark.block,
      } as Change);
      nft.forsale = list.price;
    }

    return true;
  }

  private consume(remark: Remark): boolean {
    // An NFT was consumed
    console.log("Instantiating consume");
    const burn = Consume.fromRemark(remark.remark);
    const invalidate = this.updateInvalidCalls(OP_TYPES.CONSUME, remark).bind(
      this
    );

    // Check if consume is valid
    if (typeof burn === "string") {
      invalidate(
        remark.remark,
        `[${OP_TYPES.CONSUME}] Dead before instantiation: ${burn}`
      );
      return true;
    }

    // Find the NFT in question
    const nft = this.findExistingNFT(burn);
    if (!nft) {
      invalidate(
        burn.id,
        `[${OP_TYPES.CONSUME}] Attempting to CONSUME non-existant NFT ${burn.id}`
      );
      return true;
    }

    if (nft.burned != "") {
      invalidate(
        burn.id,
        `[${OP_TYPES.CONSUME}] Attempting to burn already burned NFT ${burn.id}`
      );
      return true;
    }

    // Check if burner is owner of NFT
    if (nft.owner != remark.caller) {
      invalidate(
        burn.id,
        `[${OP_TYPES.CONSUME}] Attempting to CONSUME non-owned NFT ${burn.id}`
      );
      return true;
    }

    // Burn and note reason

    let burnReasons: string[] = [];
    // Check if we have extra calls in the batch
    if (remark.extra_ex?.length) {
      // Check if the transfer is valid, i.e. matches target recipient and value.
      remark.extra_ex?.forEach((el: BlockCall) => {
        burnReasons.push(`<consume>${el.value}</consume>`);
      });
    }

    const burnReason = burnReasons.join(",");
    nft.addChange({
      field: "burned",
      old: "",
      new: burnReason,
      caller: remark.caller,
      block: remark.block,
    } as Change);
    nft.burned = burnReason;

    // Delist if listed for sale
    nft.addChange({
      field: "forsale",
      old: nft.forsale,
      new: BigInt(0),
      caller: remark.caller,
      block: remark.block,
    } as Change);
    nft.forsale = BigInt(0);

    return true;
  }

  /**
   * An NFT was bought after having been LISTed for sale
   * @param remark
   * @private
   */
  private buy(remark: Remark): boolean {
    const invalidate = this.updateInvalidCalls(OP_TYPES.BUY, remark).bind(this);

    const buyEntity = Buy.fromRemark(remark.remark);
    if (typeof buyEntity === "string") {
      invalidate(
        remark.remark,
        `[${OP_TYPES.BUY}] Dead before instantiation: ${buyEntity}`
      );
      return true;
    }

    try {
      // Find NFT in current state
      const nft = this.findExistingNFT(buyEntity);
      interactionBuy(remark, buyEntity, nft);
    } catch (e) {
      invalidate(buyEntity.id, e.message);
      return true;
    }

    return true;
  }

  /**
   * An EMOTE reaction has been sent
   */
  private emote(remark: Remark): boolean {
    const emote = Emote.fromRemark(remark.remark);
    const invalidate = this.updateInvalidCalls(OP_TYPES.EMOTE, remark).bind(
      this
    );
    if (typeof emote === "string") {
      invalidate(
        remark.remark,
        `[${OP_TYPES.EMOTE}] Dead before instantiation: ${emote}`
      );
      return true;
    }
    const target = this.nfts.find((el) => el.getId() === emote.id);
    if (!target) {
      invalidate(
        emote.id,
        `[${OP_TYPES.EMOTE}] Attempting to emote on non-existant NFT ${emote.id}`
      );
      return true;
    }

    if (target.burned != "") {
      invalidate(
        emote.id,
        `[${OP_TYPES.EMOTE}] Cannot emote to a burned NFT ${emote.id}`
      );
      return true;
    }

    if (undefined === target.reactions[emote.unicode]) {
      target.reactions[emote.unicode] = [];
    }
    const index = target.reactions[emote.unicode].indexOf(remark.caller, 0);
    if (index > -1) {
      target.reactions[emote.unicode].splice(index, 1);
    } else {
      target.reactions[emote.unicode].push(remark.caller);
    }
    return false;
  }

  /**
   * The ownership of a collection has changed
   */
  private changeIssuer(remark: Remark): boolean {
    const invalidate = this.updateInvalidCalls(
      OP_TYPES.CHANGEISSUER,
      remark
    ).bind(this);

    let changeIssuerEntity: ChangeIssuer;
    try {
      changeIssuerEntity = getChangeIssuerEntity(remark);
    } catch (e) {
      invalidate(remark.remark, e.message);
      return true;
    }

    const collection = this.collections.find(
      (el: C100) => el.id === changeIssuerEntity.id
    );
    try {
      changeIssuerInteraction(remark, changeIssuerEntity, collection);
    } catch (e) {
      invalidate(changeIssuerEntity.id, e.message);
      return true;
    }

    return false;
  }

  public consolidate(rmrks?: Remark[]): ConsolidatorReturnType {
    const remarks = rmrks || this.adapter?.getRemarks() || [];
    //console.log(remarks);
    for (const remark of remarks) {
      console.log("==============================");
      console.log("Remark is: " + remark.remark);
      switch (remark.interaction_type) {
        case OP_TYPES.MINT:
          if (this.mint(remark)) {
            continue;
          }
          break;

        case OP_TYPES.MINTNFT:
          if (this.mintNFT(remark)) {
            continue;
          }
          break;

        case OP_TYPES.SEND:
          if (this.send(remark)) {
            continue;
          }
          break;

        case OP_TYPES.BUY:
          // An NFT was bought after being LISTed
          if (this.buy(remark)) {
            continue;
          }
          break;

        case OP_TYPES.CONSUME:
          // An NFT was burned
          if (this.consume(remark)) {
            continue;
          }
          break;

        case OP_TYPES.LIST:
          // An NFT was listed for sale
          if (this.list(remark)) {
            continue;
          }
          break;

        case OP_TYPES.EMOTE:
          if (this.emote(remark)) {
            continue;
          }
          break;

        case OP_TYPES.CHANGEISSUER:
          if (this.changeIssuer(remark)) {
            continue;
          }
          break;

        default:
          console.error(
            "Unable to process this remark - wrong type: " +
              remark.interaction_type
          );
      }
    }
    deeplog(this.nfts);
    deeplog(this.collections);

    //console.log(this.invalidCalls);
    console.log(
      `${this.nfts.length} NFTs across ${this.collections.length} collections.`
    );
    console.log(`${this.invalidCalls.length} invalid calls.`);
    return {
      nfts: this.nfts,
      collections: this.collections,
      invalid: this.invalidCalls,
    };
  }
}

type InvalidCall = {
  message: string;
  caller: string;
  block: number;
  object_id: string;
  op_type: string;
};
