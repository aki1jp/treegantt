export function filterTasks(tasks, filterStatus, filterAssignee, filterPriority, filterSearch = '') {
    let result = tasks;
    if (filterStatus === '!done')
        result = result.filter(t => t.status !== 'done' && t.status !== 'pending');
    else if (filterStatus)
        result = result.filter(t => t.status === filterStatus);
    if (filterAssignee)
        result = result.filter(t => t.assignee.includes(filterAssignee));
    if (filterPriority)
        result = result.filter(t => t.priority === filterPriority);
    if (filterSearch) {
        const q = filterSearch.toLowerCase();
        result = result.filter(t => t.title.toLowerCase().includes(q) || t.assignee.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => a.order - b.order);
}
