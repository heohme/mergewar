import fs from "node:fs";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/generate-pool-data.mjs <cards.json>");

const cards = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const wanted = new Set(["MECHANICAL", "ELEMENTAL", "QUILBOAR", "BEAST"]);
const keywordSet = new Set(["DIVINE_SHIELD", "WINDFURY", "TAUNT", "REBORN", "MAGNETIC", "VENOMOUS", "STEALTH"]);
const typeNames = { MECHANICAL: "MECHS", ELEMENTAL: "ELEMENTALS", QUILBOAR: "QUILBOAR", BEAST: "BEASTS" };
const textOverrides = {
  BGS_127: "在你使用一张元素牌后，获得+1生命值。",
  BG31_816: "当你出售本随从时，使你的随从获得+1攻击力。提升你此后火焰投球手的效果。",
  BG31_818: "当你出售本随从时，使你的随从获得+1生命值。提升你此后冰雪投球手的效果。",
  BG36_763: "一旦本随从造成35点伤害，获取一张点金之触。",
};

function cleanText(card) {
  return (textOverrides[card.id] || card.text || "")
    .replace(/<i>[\s\S]*?<\/i>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extra(card, tribe) {
  const mechanics = card.mechanics || [];
  const result = {};
  const tribes = card.races?.length ? card.races : tribe === "NEUTRAL" ? ["NEUTRAL"] : [tribe];
  if (tribes.length > 1 || tribes[0] !== tribe) result.tribes = tribes;
  const keywords = mechanics.filter((key) => keywordSet.has(key));
  if (keywords.length) result.keywords = keywords;
  result.scripts = [card.id];
  if (mechanics.includes("BATTLECRY")) result.battlecry = card.id;
  if (mechanics.includes("DEATHRATTLE")) result.deathrattle = { script: card.id };
  if (mechanics.includes("END_OF_TURN_TRIGGER")) result.endTurn = card.id;
  if (mechanics.includes("START_OF_COMBAT")) result.combatStart = card.id;
  if (mechanics.includes("BACON_RALLY")) result.rally = card.id;
  if (mechanics.includes("CHOOSE_ONE")) result.chooseOne = card.id;
  const activation = cleanText(card).match(/发动（(\d+)）：/);
  if (activation) {
    result.activate = card.id;
    result.activateCost = Number(activation[1]);
  }
  return result;
}

function line(card, tribe) {
  return `  m(${JSON.stringify(card.id)}, ${JSON.stringify(card.name)}, ${JSON.stringify(tribe)}, ${card.techLevel}, ${card.attack}, ${card.health}, ${JSON.stringify(cleanText(card))}, ${JSON.stringify(extra(card, tribe))}),`;
}

const pool = cards.filter((card) => card.isBattlegroundsPoolMinion && card.type === "MINION" && !card.isBattlegroundsDuosExclusive && card.techLevel <= 6);
for (const tribe of wanted) {
  const entries = pool.filter((card) => card.races?.includes(tribe) || card.race === tribe)
    .filter((card) => card.id !== "BG_DEEP_015")
    .sort((a, b) => a.techLevel - b.techLevel || a.dbfId - b.dbfId);
  console.log(`export const ${typeNames[tribe]} = [`);
  entries.forEach((card) => console.log(line(card, tribe)));
  console.log("];\n");
}

const neutrals = pool.filter((card) => !card.races?.length && !card.race)
  .sort((a, b) => a.techLevel - b.techLevel || a.dbfId - b.dbfId);
console.log("export const NEUTRALS = [");
neutrals.forEach((card) => console.log(line(card, "NEUTRAL")));
console.log("];\n");
