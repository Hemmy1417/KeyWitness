/**
 * The deployment this app reads and writes. The default is the deployment
 * of record, whose bytes were verified against contracts/keywitness.py; an
 * environment override points a checkout at another deployment, and the
 * status page says which one is in use.
 */
export const RECORD_ADDRESS: string = "0xB903Dcfd1730818260CFFa05d12497E73CB124Ff";

const override = process.env.NEXT_PUBLIC_KEYWITNESS_CONTRACT?.trim() ?? "";

export const CONTRACT_ADDRESS = (override || RECORD_ADDRESS) as `0x${string}`;
export const CONTRACT_CONFIGURED = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS) && !/^0x0{40}$/.test(CONTRACT_ADDRESS);
export const IS_RECORD = !!RECORD_ADDRESS && CONTRACT_ADDRESS.toLowerCase() === RECORD_ADDRESS.toLowerCase();

/** The sha256 of the contract source the deployment of record runs. */
export const SOURCE_SHA256: string = "494f2100c47426baf923576167d8df85c5193a1566505d05f9bf63d27ffb1d49";

export const REPO_URL = "https://github.com/Hemmy1417/KeyWitness";

/** The live run of the synthetic sample on the deployment of record, once recorded (a case id such as KW-0004). */
const SAMPLE_OVERRIDE = process.env.NEXT_PUBLIC_KEYWITNESS_SAMPLE_CASE?.trim() ?? "";
export const SAMPLE_CASE: string = SAMPLE_OVERRIDE || "KW-0003";
export const SOURCE_URL = `${REPO_URL}/blob/main/contracts/keywitness.py`;
