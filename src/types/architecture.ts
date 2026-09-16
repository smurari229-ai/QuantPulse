export interface PhaseRoadmapItem {
  phase: number;
  title: string;
  objective: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED' | 'GOVERNED_BLOCKED';
  filesRequired: string[];
  dependencies: string[];
  apisRequired: string[];
  securityRisks: string[];
  testsRequired: string[];
  expectedResult: string;
  passCriteria: string[];
  failCriteria: string[];
  whatRemainsIncomplete: string[];
  governanceNotes?: string;
}

export interface DeploymentPartitioningPlan {
  category: 'AI_STUDIO_SAFE' | 'GITHUB_VERCEL_EXTERNAL' | 'REGULATED_BROKER_CONTAINER';
  title: string;
  reason: string;
  components: string[];
  securityBoundaries: string[];
}

export interface RegulatoryComplianceSpec {
  framework: string; // e.g. "SEBI Algo-Trading Directives (India)"
  circularReferences: string[];
  mandatoryRequirements: {
    rule: string;
    description: string;
    systemImplementation: string;
    auditVerification: string;
  }[];
}
