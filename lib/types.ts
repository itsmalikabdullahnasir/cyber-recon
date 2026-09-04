export type Likelihood = "Info" | "Low" | "Medium" | "High" | "Critical";
export type HostStatus = "Live" | "Down" | "Filtered";
export type TargetStatus = "Not Started" | "Recon" | "Scanning" | "Enumeration" | "Exploitation" | "Post-Exploitation" | "Reporting" | "Done";
export type Scope = "In Scope" | "Out of Scope";
export type Severity = "Info" | "Low" | "Medium" | "High" | "Critical";
export type FindingStatus = "New" | "Confirmed" | "Reported" | "Fixed" | "False Positive";
export type Priority = "None" | "Low" | "Medium" | "High" | "Critical";
export type AttackVector = "Network" | "Web" | "Wireless" | "Social" | "Physical" | "Cloud" | "API" | "Mobile";

export interface Target {
  id: string;
  name: string;
  category: string;
  domain: string | null;
  ip_range: string | null;
  scope: Scope;
  status: TargetStatus;
  owner: string | null;
  created_at: string;
  description: string | null;
  priority: Priority;
  methodology: string | null;
  tags: string[] | null;
  updated_at: string;
}

export interface Host {
  id: string;
  target_id: string;
  ip: string;
  status: HostStatus;
  open_ports: string | null;
  services: string | null;
  os_guess: string | null;
  exploitability: Likelihood;
  notes: string | null;
  last_scanned: string | null;
  checked_by: string | null;
  created_at: string;
  vulnerability_count: number | null;
  banners: string | null;
  attack_vector: AttackVector | null;
  hostname: string | null;
  http_title: string | null;
  ssl_info: string | null;
}

export interface Finding {
  id: string;
  target_id: string;
  host_id: string | null;
  title: string;
  type: string | null;
  severity: Severity;
  status: FindingStatus;
  evidence: string | null;
  remediation: string | null;
  found_by: string | null;
  created_at: string;
  cvss: number | null;
  cwe: string | null;
  affected_url: string | null;
  fix_priority: Priority;
  tags: string[] | null;
}

export interface Activity {
  id: string;
  target_id: string | null;
  host_id: string | null;
  user_name: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

export const LIKELIHOOD_ORDER: Record<Likelihood, number> = {
  Info: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  Info: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  None: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

export const STATUS_COLORS: Record<TargetStatus, string> = {
  "Not Started": "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  Recon: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  Scanning: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  Enumeration: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Exploitation: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
  "Post-Exploitation": "bg-pink-500/10 text-pink-400 border-pink-500/20",
  Reporting: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export const CATEGORY_ICONS: Record<string, string> = {
  University: "🎓",
  Corp: "🏢",
  Government: "🏛️",
  CTF: "🏆",
  Healthcare: "🏥",
  Finance: "🏦",
  Retail: "🛒",
  Telecom: "📡",
  Startup: "🚀",
  Other: "📁",
};

export const ATTACK_VECTOR_ICONS: Record<string, string> = {
  Network: "🌐",
  Web: "🕸️",
  Wireless: "📡",
  Social: "👥",
  Physical: "🔑",
  Cloud: "☁️",
  API: "⚡",
  Mobile: "📱",
};

export const COMMON_PORTS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  135: "RPC",
  139: "NetBIOS",
  143: "IMAP",
  443: "HTTPS",
  445: "SMB",
  993: "IMAPS",
  995: "POP3S",
  1433: "MSSQL",
  1521: "Oracle",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5900: "VNC",
  6379: "Redis",
  8080: "HTTP-Alt",
  8443: "HTTPS-Alt",
  8888: "HTTP-Proxy",
  9090: "Web-Console",
  27017: "MongoDB",
};

export const METHODOLOGY_PRESETS = [
  "OWASP Top 10",
  "PTES",
  "OSSTMM",
  "NIST SP 800-115",
  "ISSAF",
  "Web Application",
  "Network Infrastructure",
  "Social Engineering",
  "Wireless",
  "Custom",
];
