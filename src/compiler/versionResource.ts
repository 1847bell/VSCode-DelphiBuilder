import { DprojEvaluation, ProjectVersionInfo, ProjectVersionNumber } from "../core/types";
import { localize } from "../localization/localizer";

// Standard empty Win32 .res null header.
export const MINIMAL_PROJECT_RESOURCE = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00,
  0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
]);

export function getProjectVersionInfo(evaluation: DprojEvaluation): ProjectVersionInfo | undefined {
  const properties = evaluation.properties;
  if (properties.VerInfo_IncludeVerInfo?.trim().toLocaleLowerCase() !== "true") {
    return undefined;
  }

  const strings = Object.fromEntries((properties.VerInfo_Keys ?? "").split(";")
    .flatMap((entry) => {
      const separator = entry.indexOf("=");
      const name = entry.slice(0, separator).trim();
      return separator >= 0 && name ? [[name, entry.slice(separator + 1)]] : [];
    }));
  const componentVersion = [
    properties.VerInfo_MajorVer ?? "1",
    properties.VerInfo_MinorVer ?? "0",
    properties.VerInfo_Release ?? "0",
    properties.VerInfo_Build ?? "0"
  ].join(".");
  const numericVersion = /^\d+(?:\.\d+){0,3}$/;
  const fileVersion = parseVersion(
    numericVersion.test(strings.FileVersion?.trim() ?? "") ? strings.FileVersion : componentVersion,
    "FileVersion"
  );
  const productVersion = numericVersion.test(strings.ProductVersion?.trim() ?? "")
    ? parseVersion(strings.ProductVersion, "ProductVersion")
    : fileVersion;
  const languageId = parseWord(properties.VerInfo_Locale ?? "1033", "VerInfo_Locale");
  const library = properties.AppType?.toLocaleLowerCase() === "library"
    || properties.DCC_OutputType?.toLocaleLowerCase() === "library"
    || properties.GenDll?.toLocaleLowerCase() === "true"
    || /\.dpk$/i.test(evaluation.mainSource);
  return {
    fileVersion,
    productVersion,
    languageId,
    fileType: library ? 2 : 1,
    strings: {
      ...strings,
      FileVersion: strings.FileVersion || fileVersion.join("."),
      ProductVersion: strings.ProductVersion || productVersion.join(".")
    }
  };
}

export function updateVersionResource(content: Buffer, info: ProjectVersionInfo): Buffer {
  const records: Buffer[] = content.length === 0 ? [MINIMAL_PROJECT_RESOURCE] : [];
  let offset = 0;
  while (offset < content.length) {
    if (content.length - offset < 28) {
      throw new Error(localize("projectResource.error.invalid"));
    }
    const dataSize = content.readUInt32LE(offset);
    const headerSize = content.readUInt32LE(offset + 4);
    const end = offset + headerSize + dataSize;
    if (headerSize < 28 || headerSize % 4 !== 0 || end > content.length) {
      throw new Error(localize("projectResource.error.invalid"));
    }
    const next = Math.min(align4(end), content.length);
    const versionRecord = content.readUInt16LE(offset + 8) === 0xffff
      && content.readUInt16LE(offset + 10) === 16;
    if (!versionRecord) {
      records.push(pad4(content.subarray(offset, next)));
    }
    offset = next;
  }
  records.push(createVersionRecord(info));
  return Buffer.concat(records);
}

function createVersionRecord(info: ProjectVersionInfo): Buffer {
  const fixed = Buffer.alloc(52);
  const words = [
    0xfeef04bd, 0x00010000,
    versionDword(info.fileVersion[0], info.fileVersion[1]),
    versionDword(info.fileVersion[2], info.fileVersion[3]),
    versionDword(info.productVersion[0], info.productVersion[1]),
    versionDword(info.productVersion[2], info.productVersion[3]),
    0x3f, 0, 0x00040004, info.fileType, 0, 0, 0
  ];
  words.forEach((value, index) => fixed.writeUInt32LE(value, index * 4));
  const translation = Buffer.alloc(4);
  translation.writeUInt16LE(info.languageId, 0);
  translation.writeUInt16LE(1200, 2);
  const stringTable = info.languageId.toString(16).padStart(4, "0") + "04b0";
  const data = versionBlock("VS_VERSION_INFO", fixed, [
    versionBlock("StringFileInfo", Buffer.alloc(0), [
      versionBlock(stringTable, Buffer.alloc(0), Object.entries(info.strings).map(([name, value]) => (
        versionBlock(name, utf16(value), [], true)
      )), true)
    ], true),
    versionBlock("VarFileInfo", Buffer.alloc(0), [
      versionBlock("Translation", translation)
    ], true)
  ]);
  const record = Buffer.alloc(align4(32 + data.length));
  record.writeUInt32LE(data.length, 0);
  record.writeUInt32LE(32, 4);
  record.writeUInt16LE(0xffff, 8);
  record.writeUInt16LE(16, 10); // RT_VERSION
  record.writeUInt16LE(0xffff, 12);
  record.writeUInt16LE(1, 14);
  record.writeUInt16LE(0x0030, 20);
  record.writeUInt16LE(info.languageId, 22);
  data.copy(record, 32);
  return record;
}

function versionBlock(
  key: string,
  value: Buffer,
  children: Buffer[] = [],
  text = false
): Buffer {
  const keyData = utf16(key);
  const valueOffset = align4(6 + keyData.length);
  const childData = Buffer.concat(children.map(pad4));
  const childOffset = align4(valueOffset + value.length);
  const length = children.length > 0 ? childOffset + childData.length : valueOffset + value.length;
  if (length > 0xffff) {
    throw new Error(localize("projectResource.error.tooLarge"));
  }
  const block = Buffer.alloc(length);
  block.writeUInt16LE(length, 0);
  block.writeUInt16LE(text ? value.length / 2 : value.length, 2);
  block.writeUInt16LE(text ? 1 : 0, 4);
  keyData.copy(block, 6);
  value.copy(block, valueOffset);
  childData.copy(block, childOffset);
  return block;
}

function parseVersion(value: string, property: string): ProjectVersionNumber {
  const parts = value.trim().split(".");
  if (parts.length < 1 || parts.length > 4 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(localize("projectResource.error.version", { property, value }));
  }
  const words = parts.map((part) => parseWord(part, property));
  return [words[0], words[1] ?? 0, words[2] ?? 0, words[3] ?? 0];
}

function parseWord(value: string, property: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) {
    throw new Error(localize("projectResource.error.version", { property, value }));
  }
  return parsed;
}

function versionDword(high: number, low: number): number {
  return (high * 0x10000 + low) >>> 0;
}

function utf16(value: string): Buffer {
  return Buffer.from(`${value}\0`, "utf16le");
}

function align4(value: number): number {
  return Math.ceil(value / 4) * 4;
}

function pad4(value: Buffer): Buffer {
  return value.length % 4 === 0 ? value : Buffer.concat([value, Buffer.alloc(align4(value.length) - value.length)]);
}
