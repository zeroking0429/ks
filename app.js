const code = document.getElementById("code");
const linesDiv = document.getElementById("lines");

function updateLines() {
  const count = code.value.split("\n").length;
  linesDiv.innerHTML = "";

  for (let i = 1; i <= count; i++) {
    const div = document.createElement("div");
    div.textContent = i;
    linesDiv.appendChild(div);
  }
}

let currentLine = 1;
let errorLine = null;

function highlightCurrentLine() {
  const line = code.value.substr(0, code.selectionStart).split("\n").length;

  [...linesDiv.children].forEach((el, i) => {
    el.classList.toggle("active", i + 1 === line);
  });
}

code.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();

    const start = code.selectionStart;
    const end = code.selectionEnd;

    code.value =
      code.value.substring(0, start) + "  " + code.value.substring(end);

    code.selectionStart = code.selectionEnd = start + 2;
    updateLines();
  }
});

code.addEventListener("input", () => {
  updateLines();
  highlightCurrentLine();
});

code.addEventListener("click", highlightCurrentLine);
code.addEventListener("keyup", highlightCurrentLine);

code.addEventListener("scroll", () => {
  linesDiv.scrollTop = code.scrollTop;
});

function runKS() {
  const output = document.getElementById("output");
  output.textContent = "";

  let lines = code.value.split("\n");
  const vars = {};

  let i = 0;

  function tokenize(expr, line) {
    let tokens = [];
    let i = 0;

    while (i < expr.length) {
      const ch = expr[i];

      // 공백
      if (ch === " ") {
        i++;
        continue;
      }

      // 숫자
      if (/\d/.test(ch)) {
        let num = "";
        while (i < expr.length && /\d/.test(expr[i])) {
          num += expr[i++];
        }
        tokens.push(Number(num));
        continue;
      }

      // 문자열
      if (ch === '"') {
        let str = "";
        i++;

        while (i < expr.length && expr[i] !== '"') {
          str += expr[i++];
        }

        if (i >= expr.length) {
          error('문자열이 끝나지 않았어요 (")', line);
        }

        i++; // 닫는 "
        tokens.push(str);
        continue;
      }

      // 변수
      if (/[a-zA-Z가-힣_]/.test(ch)) {
        let name = "";
        while (i < expr.length && /[a-zA-Z가-힣0-9_]/.test(expr[i])) {
          name += expr[i++];
        }
        tokens.push({ type: "var", name });
        continue;
      }

      // 연산자 / 괄호
      if ("+-*/()".includes(ch)) {
        tokens.push(ch);
        i++;
        continue;
      }

      error(`'${ch}' 은(는) 사용할 수 없는 문자예요`, line);
    }

    return tokens;
  }

  function readBlock(start) {
    let block = [];
    let depth = 0;
    let i = start;

    while (i < lines.length) {
      if (lines[i].includes("{")) depth++;
      if (lines[i].includes("}")) depth--;

      if (depth > 0 && i !== start) {
        block.push(lines[i]);
      }

      if (depth === 0) break;
      i++;
    }

    return { block, end: i };
  }

  function runBlock(blockLines) {
    let savedI = i;
    let savedLines = lines;

    lines = blockLines;
    i = 0;

    while (i < lines.length) {
      executeLine(lines[i], i);
    }

    lines = savedLines;
    i = savedI;
  }

  function print(msg) {
    output.textContent += msg + "\n";
  }

  function error(msg, line) {
    errorLine = line;
    updateLines();

    print(`❌ ${line + 1}번째 줄에서 오류가 있어요`);
    print(`   ${msg}`);
    throw new Error("KS Error");
  }

  function getValue(token, line) {
    if (/^\d+$/.test(token)) return Number(token);
    if (token.startsWith('"') && token.endsWith('"')) {
      return token.slice(1, -1);
    }
    if (token in vars) return vars[token];
    error(`'${token}' 이라는 변수는 아직 없어요`, line);
  }

  function evalTokens(tokens, line) {
    tokens = tokens.map((t) => {
      if (typeof t === "object" && t.type === "var") {
        if (!(t.name in vars)) {
          error(`'${t.name}' 이라는 변수는 아직 없어요`, line);
        }
        return vars[t.name];
      }
      return t;
    });

    // 괄호 처리
    while (tokens.includes("(")) {
      let close = tokens.indexOf(")");
      if (close === -1) error("괄호 '(' 가 닫히지 않았어요", line);

      let open = close;
      while (tokens[open] !== "(") open--;

      const inner = tokens.slice(open + 1, close);
      const value = evalTokens(inner, line);

      tokens.splice(open, close - open + 1, value);
    }

    // * /
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === "*" || tokens[i] === "/") {
        const a = tokens[i - 1];
        const b = tokens[i + 1];
        const r = tokens[i] === "*" ? a * b : a / b;
        if (typeof a !== "number" || typeof b !== "number") {
          error("연산자 앞뒤에는 숫자가 있어야 해요", line);
        }

        tokens.splice(i - 1, 3, r);
        i--;
      }
    }

    // + -
    let result = tokens[0];
    for (let i = 1; i < tokens.length; i += 2) {
      if (tokens[i] === "+") result += tokens[i + 1];
      if (tokens[i] === "-") result -= tokens[i + 1];
    }

    return result;
  }

  function calc(expr, line) {
    const tokens = tokenize(expr, line);
    return evalTokens(tokens, line);
  }

  function splitTopLevel(expr, keyword) {
    let depth = 0;
    let parts = [];
    let current = "";

    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === "(") depth++;
      if (expr[i] === ")") depth--;

      if (depth === 0 && expr.startsWith(keyword, i)) {
        parts.push(current.trim());
        current = "";
        i += keyword.length - 1;
        continue;
      }

      current += expr[i];
    }

    parts.push(current.trim());
    return parts;
  }

  function executeLine(rawLine, lineNumber) {
    let line = rawLine.split("#")[0].trim();
    if (line === "") {
      i++;
      return;
    }

    // 출력
    if (line.startsWith("출력(") && line.endsWith(")")) {
      const content = line.slice(line.indexOf("(") + 1, line.lastIndexOf(")"));
      print(calc(content, lineNumber));
      i++;
      return;
    }

    // 입력
    if (line.includes("= 입력")) {
      const [name, rest] = line.split("=");
      const promptText = rest.includes("(")
        ? rest
            .slice(rest.indexOf("(") + 1, rest.lastIndexOf(")"))
            .replace(/"/g, "")
        : "";
      const value = prompt(promptText);
      vars[name.trim()] = isNaN(value) ? value : Number(value);
      i++;
      return;
    }

    // 만약
    if (line.startsWith("만약 ")) {
      const cond = line.slice(3).replace("{", "").trim();
      const ok = condition(cond, lineNumber);

      const ifBlock = readBlock(i);
      i = ifBlock.end + 1;

      let elseBlock = null;
      if (i < lines.length && lines[i].startsWith("아니면")) {
        elseBlock = readBlock(i);
        i = elseBlock.end + 1;
      }

      if (ok) runBlock(ifBlock.block);
      else if (elseBlock) runBlock(elseBlock.block);
      return;
    }

    // 반복
    if (line.startsWith("반복 ")) {
      const count = Number(line.split(" ")[1]);
      if (isNaN(count)) error("반복 횟수는 숫자여야 해요", lineNumber);

      const { block, end } = readBlock(i);
      for (let c = 0; c < count; c++) {
        runBlock(block);
      }

      i = end + 1;
      return;
    }

    // 변수 대입
    if (line.includes("=")) {
      const [name, expr] = line.split("=");
      vars[name.trim()] = calc(expr.trim(), lineNumber);
      i++;
      return;
    }

    error("이 문장은 이해할 수 없어요", lineNumber);
  }

  function condition(expr, line) {
    expr = expr.trim();

    // 전체 괄호 제거
    if (expr.startsWith("(") && expr.endsWith(")")) {
      let depth = 0;
      let ok = true;

      for (let i = 0; i < expr.length; i++) {
        if (expr[i] === "(") depth++;
        if (expr[i] === ")") depth--;
        if (depth === 0 && i < expr.length - 1) {
          ok = false;
          break;
        }
      }

      if (ok) return condition(expr.slice(1, -1), line);
    }

    // 또는
    const orParts = splitTopLevel(expr, " 또는 ");
    if (orParts.length > 1) {
      return orParts.some((e) => condition(e, line));
    }

    // 그리고
    const andParts = splitTopLevel(expr, " 그리고 ");
    if (andParts.length > 1) {
      return andParts.every((e) => condition(e, line));
    }

    // 비교
    const ops = [">=", "<=", "==", "!=", ">", "<"];
    for (let op of ops) {
      const idx = expr.indexOf(op);
      if (idx !== -1) {
        const l = calc(expr.slice(0, idx), line);
        const r = calc(expr.slice(idx + op.length), line);

        switch (op) {
          case "==":
            return l == r;
          case "!=":
            return l != r;
          case ">":
            return l > r;
          case "<":
            return l < r;
          case ">=":
            return l >= r;
          case "<=":
            return l <= r;
        }
      }
    }

    error("조건식에는 비교 연산자가 필요해요", line);
  }

  while (i < lines.length) {
    executeLine(lines[i], i);
  }
}
