import { OP_TYPES } from "../../constants";
import { BlockCall } from "../../types";
import { Change } from "../../../rmrk1.0.0/changelog";
import { Remark } from "../remark";
import { Consume } from "../../../rmrk1.0.0/classes/consume";
import { NFT } from "../../..";

export const consumeInteraction = (
  remark: Remark,
  consumeEntity: Consume,
  nft?: NFT
): void => {
  if (!nft) {
    throw new Error(
      `[${OP_TYPES.CONSUME}] Attempting to CONSUME non-existant NFT ${consumeEntity.id}`
    );
  }

  if (nft.burned != "") {
    throw new Error(
      `[${OP_TYPES.CONSUME}] Attempting to burn already burned NFT ${consumeEntity.id}`
    );
  }

  // Check if burner is owner of NFT
  if (nft.owner != remark.caller) {
    throw new Error(
      `[${OP_TYPES.CONSUME}] Attempting to CONSUME non-owned NFT ${consumeEntity.id}`
    );
  }

  // Burn and note reason

  const burnReasons: string[] = [];
  // Check if we have extra calls in the batch
  if (remark.extra_ex?.length) {
    // Check if the transfer is valid, i.e. matches target recipient and value.
    remark.extra_ex?.forEach((el: BlockCall) => {
      burnReasons.push(`<consume>${el.value}</consume>`);
    });
  }

  if (burnReasons.length < 1) {
    throw new Error(
      `[${OP_TYPES.CONSUME}] Attempting to CONSUME NFT ${consumeEntity.id} without a reason`
    );
  }

  nft.updatedAtBlock = remark.block;
  const burnReason = burnReasons.join(",");
  nft.addChange({
    field: "burned",
    old: "",
    new: burnReason,
    caller: remark.caller,
    block: remark.block,
    opType: OP_TYPES.CONSUME,
  } as Change);
  nft.burned = burnReason;

  // De list if listed for sale
  nft.addChange({
    field: "forsale",
    old: nft.forsale,
    new: BigInt(0),
    caller: remark.caller,
    block: remark.block,
    opType: OP_TYPES.CONSUME,
  } as Change);
  nft.forsale = BigInt(0);
};
