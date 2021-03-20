import { validateEmote } from "../../tools/validate-remark";
import { OP_TYPES, PREFIX, VERSION } from "../../tools/constants";

export class Emote {
  unicode: string;
  id: string;
  static V = "1.0.0";

  constructor(id: string, unicode: string) {
    this.unicode = unicode;
    this.id = id;
  }

  static fromRemark(remark: string): Emote | string {
    try {
      validateEmote(remark);
      const [_prefix, _op_type, _version, id, unicode] = remark.split("::");
      return new Emote(id, unicode);
    } catch (e) {
      console.error(e.message);
      console.log(`EMOTE error: full input was ${remark}`);
      return e.message;
    }
  }

  public toRemark(): string {
    return `${PREFIX}::${OP_TYPES.EMOTE}::${VERSION}::${this.id}::${this.unicode}`;
  }
}
