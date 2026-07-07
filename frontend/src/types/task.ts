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

export interface Project {
  id:        string;
  name:      string;
  color:     string | null;
  capacityMinutesPerDay: number | null;
  workingDays: number[] | null;
  createdAt: string;
}

/** リソース設定（アプリ既定）。/api/v1/settings から取得。 */
export interface AppSettings {
  capacityMinutesPerDay: number;
  workingDays: number[];
}

/** クロスプロジェクト参照（task_refs, §5.8）。projectId=参照する側、refTaskId=参照先タスク。 */
export interface TaskRef {
  projectId:  string;
  refTaskId:  string;
  createdAt:  string;
}

/** GET /projects/:id/refs のレスポンスに含まれる参照先プロジェクトの要約情報（重複排除済み）。 */
export type RefProject = Pick<Project, 'id' | 'name' | 'color'>;
