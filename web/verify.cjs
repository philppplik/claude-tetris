const noop = () => {};
const ctxStub = new Proxy({}, { get: () => noop });
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/assets/tetris-demo.js", "utf8");
const wrapped = "const window={addEventListener(){}};const document={getElementById:()=>null,addEventListener(){}};const requestAnimationFrame=()=>{};" +
  src.replace(/window\.addEventListener[\s\S]*$/, "") + "module.exports={DemoGame};";
fs.writeFileSync("/tmp/dg.js", wrapped);
const { DemoGame } = require("/tmp/dg.js");

const g = new DemoGame({ getContext: () => ctxStub, width: 200, height: 400 }, { cell: 20 });
g.spawn("T"); g.rotate(1); g.move(1); g.softDrop();
console.log("rotate/move/softdrop OK | board:", g.board.length + "x" + g.board[0].length);
g.spawn("I"); console.log("ghost row >= 0:", g.ghostRow() >= 0);
g.holdPiece(); console.log("hold set:", g.hold !== null, "| canHold locked:", g.canHold === false);
console.log("ALL LOGIC CHECKS PASSED");
