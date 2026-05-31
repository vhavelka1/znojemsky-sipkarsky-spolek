export type MultiplierName = "single" | "double" | "triple";

export type CheckoutSuggestion = {
  score: number;
  primary: string[];
  alternatives?: string[][];
};

type DartTarget = {
  label: string;
  value: number;
  multiplier: MultiplierName;
};

const preferredCheckouts: Record<number, CheckoutSuggestion> = {
  170: { score: 170, primary: ["T20", "T20", "Bull"] },
  167: { score: 167, primary: ["T20", "T19", "Bull"] },
  164: { score: 164, primary: ["T20", "T18", "Bull"] },
  161: { score: 161, primary: ["T20", "T17", "Bull"] },
  160: { score: 160, primary: ["T20", "T20", "D20"] },
  158: { score: 158, primary: ["T20", "T20", "D19"] },
  157: { score: 157, primary: ["T20", "T19", "D20"] },
  156: { score: 156, primary: ["T20", "T20", "D18"] },
  155: { score: 155, primary: ["T20", "T19", "D19"] },
  154: { score: 154, primary: ["T20", "T18", "D20"] },
  153: { score: 153, primary: ["T20", "T19", "D18"] },
  152: { score: 152, primary: ["T20", "T20", "D16"] },
  151: { score: 151, primary: ["T20", "T17", "D20"] },
  150: { score: 150, primary: ["T20", "T18", "D18"] },
  149: { score: 149, primary: ["T20", "T19", "D16"] },
  148: { score: 148, primary: ["T20", "T20", "D14"] },
  147: { score: 147, primary: ["T20", "T17", "D18"] },
  146: { score: 146, primary: ["T20", "T18", "D16"] },
  145: { score: 145, primary: ["T20", "T15", "D20"] },
  144: { score: 144, primary: ["T20", "T20", "D12"] },
  141: { score: 141, primary: ["T20", "T19", "D12"] },
  140: { score: 140, primary: ["T20", "T20", "D10"] },
  136: { score: 136, primary: ["T20", "T20", "D8"] },
  132: { score: 132, primary: ["Bull", "Bull", "D16"] },
  130: { score: 130, primary: ["T20", "T20", "D5"] },
  129: { score: 129, primary: ["T19", "T16", "D12"] },
  128: { score: 128, primary: ["T18", "T18", "D10"] },
  127: { score: 127, primary: ["T20", "T17", "D8"] },
  126: { score: 126, primary: ["T19", "T19", "D6"] },
  125: { score: 125, primary: ["25", "T20", "D20"] },
  124: { score: 124, primary: ["T20", "T14", "D11"] },
  123: { score: 123, primary: ["T19", "T16", "D9"] },
  122: { score: 122, primary: ["T18", "T18", "D7"] },
  121: { score: 121, primary: ["T20", "T11", "D14"] },
  120: { score: 120, primary: ["T20", "20", "D20"] },
  119: { score: 119, primary: ["T19", "T12", "D13"] },
  118: { score: 118, primary: ["T20", "18", "D20"] },
  117: { score: 117, primary: ["T20", "17", "D20"] },
  116: { score: 116, primary: ["T20", "16", "D20"] },
  115: { score: 115, primary: ["T20", "15", "D20"] },
  114: { score: 114, primary: ["T20", "14", "D20"] },
  113: { score: 113, primary: ["T20", "13", "D20"] },
  112: { score: 112, primary: ["T20", "12", "D20"] },
  111: { score: 111, primary: ["T20", "11", "D20"] },
  110: { score: 110, primary: ["T20", "10", "D20"] },
  109: { score: 109, primary: ["T20", "9", "D20"] },
  108: { score: 108, primary: ["T20", "16", "D16"] },
  107: { score: 107, primary: ["T19", "18", "D16"] },
  106: { score: 106, primary: ["T20", "10", "D18"] },
  105: { score: 105, primary: ["T20", "13", "D16"] },
  104: { score: 104, primary: ["T20", "12", "D16"] },
  103: { score: 103, primary: ["T19", "10", "D18"] },
  102: { score: 102, primary: ["T20", "10", "D16"] },
  101: { score: 101, primary: ["T17", "18", "D16"] },
  100: { score: 100, primary: ["T20", "D20"], alternatives: [["20", "T20", "D10"]] },
  99: { score: 99, primary: ["T19", "10", "D16"] },
  98: { score: 98, primary: ["T20", "D19"] },
  97: { score: 97, primary: ["T19", "D20"] },
  96: { score: 96, primary: ["T20", "D18"] },
  95: { score: 95, primary: ["T19", "D19"] },
  94: { score: 94, primary: ["T18", "D20"] },
  93: { score: 93, primary: ["T19", "D18"] },
  92: { score: 92, primary: ["T20", "D16"] },
  91: { score: 91, primary: ["T17", "D20"] },
  90: { score: 90, primary: ["T18", "D18"] },
  89: { score: 89, primary: ["T19", "D16"] },
  88: { score: 88, primary: ["T16", "D20"] },
  87: { score: 87, primary: ["T17", "D18"] },
  86: { score: 86, primary: ["T18", "D16"] },
  85: { score: 85, primary: ["T15", "D20"] },
  84: { score: 84, primary: ["T20", "D12"] },
  83: { score: 83, primary: ["T17", "D16"] },
  82: { score: 82, primary: ["Bull", "D16"], alternatives: [["T14", "D20"]] },
  81: { score: 81, primary: ["T19", "D12"] },
  80: { score: 80, primary: ["T20", "D10"] },
  79: { score: 79, primary: ["T19", "D11"] },
  78: { score: 78, primary: ["T18", "D12"] },
  77: { score: 77, primary: ["T19", "D10"] },
  76: { score: 76, primary: ["T20", "D8"] },
  75: { score: 75, primary: ["T17", "D12"] },
  74: { score: 74, primary: ["T14", "D16"] },
  73: { score: 73, primary: ["T19", "D8"] },
  72: { score: 72, primary: ["T16", "D12"] },
  71: { score: 71, primary: ["T13", "D16"] },
  70: { score: 70, primary: ["T18", "D8"] },
  69: { score: 69, primary: ["T19", "D6"] },
  68: { score: 68, primary: ["T20", "D4"] },
  67: { score: 67, primary: ["T17", "D8"] },
  66: { score: 66, primary: ["T10", "D18"] },
  65: { score: 65, primary: ["T19", "D4"] },
  64: { score: 64, primary: ["T16", "D8"] },
  63: { score: 63, primary: ["T13", "D12"] },
  62: { score: 62, primary: ["T10", "D16"] },
  61: { score: 61, primary: ["T15", "D8"] },
  60: { score: 60, primary: ["20", "D20"] },
  59: { score: 59, primary: ["19", "D20"] },
  58: { score: 58, primary: ["18", "D20"] },
  57: { score: 57, primary: ["17", "D20"] },
  56: { score: 56, primary: ["16", "D20"] },
  55: { score: 55, primary: ["15", "D20"] },
  54: { score: 54, primary: ["14", "D20"] },
  53: { score: 53, primary: ["13", "D20"] },
  52: { score: 52, primary: ["12", "D20"] },
  51: { score: 51, primary: ["11", "D20"] },
  50: { score: 50, primary: ["Bull"] },
  49: { score: 49, primary: ["17", "D16"] },
  48: { score: 48, primary: ["16", "D16"] },
  47: { score: 47, primary: ["15", "D16"] },
  46: { score: 46, primary: ["14", "D16"] },
  45: { score: 45, primary: ["13", "D16"] },
  44: { score: 44, primary: ["12", "D16"] },
  43: { score: 43, primary: ["11", "D16"] },
  42: { score: 42, primary: ["10", "D16"] },
  41: { score: 41, primary: ["9", "D16"] },
  40: { score: 40, primary: ["D20"] },
};

const allTargets: DartTarget[] = [
  ...Array.from({ length: 20 }, (_, index) => index + 1).flatMap((value) => [
    { label: `${value}`, value, multiplier: "single" as const },
    { label: `D${value}`, value: value * 2, multiplier: "double" as const },
    { label: `T${value}`, value: value * 3, multiplier: "triple" as const },
  ]),
  { label: "25", value: 25, multiplier: "single" },
  { label: "Bull", value: 50, multiplier: "double" },
];

const finishingTargets = allTargets.filter((target) => target.multiplier === "double");

function routeScore(route: string[]) {
  return route.reduce((sum, label) => {
    if (label === "Bull") return sum + 50;
    if (label === "25") return sum + 25;
    if (label.startsWith("D")) return sum + Number(label.slice(1)) * 2;
    if (label.startsWith("T")) return sum + Number(label.slice(1)) * 3;
    return sum + Number(label);
  }, 0);
}

function findGeneratedCheckout(score: number): CheckoutSuggestion | null {
  for (const finish of finishingTargets) {
    if (finish.value === score) {
      return { score, primary: [finish.label] };
    }
  }

  for (const first of allTargets) {
    for (const finish of finishingTargets) {
      if (first.value + finish.value === score) {
        return { score, primary: [first.label, finish.label] };
      }
    }
  }

  for (const first of allTargets) {
    for (const second of allTargets) {
      for (const finish of finishingTargets) {
        if (first.value + second.value + finish.value === score) {
          return { score, primary: [first.label, second.label, finish.label] };
        }
      }
    }
  }

  return null;
}

export function getCheckout(score: number): CheckoutSuggestion | null {
  if (!Number.isInteger(score) || score < 2 || score > 170) {
    return null;
  }

  const preferred = preferredCheckouts[score];
  if (preferred && routeScore(preferred.primary) === score) {
    return preferred;
  }

  return findGeneratedCheckout(score);
}

export function isCheckoutPossible(score: number): boolean {
  return getCheckout(score) !== null;
}

export function isValidDoubleOutFinish(
  scoreBefore: number,
  dartValue: number,
  multiplier: MultiplierName,
): boolean {
  const score = multiplier === "double" ? dartValue * 2 : multiplier === "triple" ? dartValue * 3 : dartValue;
  const isDouble = multiplier === "double";
  return scoreBefore - score === 0 && isDouble;
}
