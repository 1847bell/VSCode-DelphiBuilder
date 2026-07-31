const PROPERTY_PATTERN = /\$\(([^)]+)\)/g;

export class PropertyBag {
  private readonly values = new Map<string, { name: string; value: string }>();

  public constructor(initial: Record<string, string | undefined> = {}) {
    for (const [name, value] of Object.entries(initial)) {
      if (value !== undefined) {
        this.set(name, value);
      }
    }
  }

  public get(name: string): string | undefined {
    return this.values.get(name.toLocaleLowerCase())?.value;
  }

  public set(name: string, value: string): void {
    this.values.set(name.toLocaleLowerCase(), { name, value });
  }

  public has(name: string): boolean {
    return this.values.has(name.toLocaleLowerCase());
  }

  public toObject(): Record<string, string> {
    return Object.fromEntries(
      [...this.values.values()].map(({ name, value }) => [name, value])
    );
  }
}

export interface ExpansionResult {
  value: string;
  unresolved: string[];
}

export function expandProperties(
  input: string,
  properties: PropertyBag,
  maxDepth = 20
): ExpansionResult {
  return expand(input, properties, maxDepth, false);
}

export function expandMsBuildProperties(
  input: string,
  properties: PropertyBag,
  maxDepth = 20
): ExpansionResult {
  return expand(input, properties, maxDepth, true);
}

function expand(
  input: string,
  properties: PropertyBag,
  maxDepth: number,
  undefinedAsEmpty: boolean
): ExpansionResult {
  let value = input;
  const seen = new Set<string>();
  const missing = new Set<string>();

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (seen.has(value)) {
      break;
    }
    seen.add(value);

    let changed = false;
    value = value.replace(PROPERTY_PATTERN, (match, propertyName: string) => {
      const normalizedName = propertyName.trim();
      const replacement = properties.get(normalizedName);
      if (replacement === undefined) {
        missing.add(normalizedName);
        return undefinedAsEmpty ? "" : match;
      }
      changed = true;
      return replacement;
    });

    if (!changed || !PROPERTY_PATTERN.test(value)) {
      PROPERTY_PATTERN.lastIndex = 0;
      break;
    }
    PROPERTY_PATTERN.lastIndex = 0;
  }

  const remaining = [...value.matchAll(PROPERTY_PATTERN)].map((match) => match[1].trim());
  PROPERTY_PATTERN.lastIndex = 0;
  if (undefinedAsEmpty) {
    value = value.replace(PROPERTY_PATTERN, "");
    PROPERTY_PATTERN.lastIndex = 0;
  }
  return {
    value,
    unresolved: undefinedAsEmpty
      ? [...new Set([...missing, ...remaining])]
      : [...new Set(remaining)]
  };
}
