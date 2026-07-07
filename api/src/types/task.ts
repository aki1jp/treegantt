export type TaskStatus   = 'todo' | 'wip' | 'done' | 'wait' | 'pending';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type ZoomLevel    = 'day' | 'week' | 'month';

export interface Task {
  id:           string;
  projectId:    string;
  parentId:     string | null;
  title:        string;
  summary:      string;
  description:  string;
  status:       TaskStatus;
  priority:     TaskPriority;
  progress:     number;
  assignee:     string;
  startDate:    string | null;
  endDate:      string | null;
  isMilestone:  boolean;
  predecessors: string[];
  seq:          number;
  order:        number;
  titleColor:   string | null;
  titleBgColor: string | null;
  estimateMinutes: number | null;
  createdAt:    string;
  updatedAt:    string;
}

export type TaskWithSuccessors = Task & { successors: string[] };

// クロスプロジェクト参照（§5.8）。projectId が「参照する側」、refTaskId が参照先タスク
export interface TaskRef {
  projectId:  string;
  refTaskId:  string;
  createdAt:  string;
}

export interface Project {
  id:        string;
  name:      string;
  color:     string | null;
  capacityMinutesPerDay: number | null;
  workingDays: number[] | null;
  createdAt: string;
}
