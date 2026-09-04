export type Likelihood = "Info" | "Low" | "Medium" | "High" | "Critical";
export type HostStatus = "Live" | "Down" | "Filtered";
export type TargetStatus = "Not Started" | "Recon" | "Testing" | "Reporting" | "Done";
export type Scope = "In Scope" | "Out of Scope";
export type Severity = "Info" | "Low" | "Medium" | "High" | "Critical";
export type FindingStatus = "New" | "Confirmed" | "Reported" | "Fixed" | "False Positive";

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
