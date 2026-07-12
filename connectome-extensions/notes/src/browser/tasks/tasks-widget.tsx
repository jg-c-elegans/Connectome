import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { NoteIndexService, TaskOccurrence } from '../note-index-service';
import { TaskToggleService } from './task-toggle-service';

@injectable()
export class TasksWidget extends ReactWidget {
    static readonly ID = 'connectome-workspace-tasks';
    static readonly LABEL = 'Tasks';

    @inject(NoteIndexService) protected readonly index: NoteIndexService;
    @inject(TaskToggleService) protected readonly toggleService: TaskToggleService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;

    protected tasks: TaskOccurrence[] = [];
    protected showOpen = true;
    protected showCompleted = true;
    protected loading = true;

    @postConstruct()
    protected init(): void {
        this.id = TasksWidget.ID;
        this.title.label = TasksWidget.LABEL;
        this.title.caption = 'Checklist items across workspace notes';
        this.title.iconClass = codicon('checklist');
        this.title.closable = false;
        this.addClass('connectome-notes-widget');
        this.toDispose.push(this.index.onDidUpdate(() => this.refresh()));
        this.initialize();
    }

    protected async initialize(): Promise<void> {
        await this.index.initialize();
        this.loading = false;
        this.refresh();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected refresh(): void {
        this.tasks = this.index.getTasks();
        this.update();
    }

    protected render(): React.ReactNode {
        if (this.loading) {
            return <div className='connectome-notes-empty'>Indexing tasks…</div>;
        }
        const visible = this.tasks.filter(task => task.completed ? this.showCompleted : this.showOpen);
        const grouped = new Map<string, TaskOccurrence[]>();
        for (const task of visible) {
            const list = grouped.get(task.sourceUri) ?? [];
            list.push(task);
            grouped.set(task.sourceUri, list);
        }
        return <div className='connectome-tasks-root'>
            <div className='connectome-tasks-filters'>
                <label><input type='checkbox' checked={this.showOpen}
                    onChange={event => { this.showOpen = event.currentTarget.checked; this.update(); }} /> Open</label>
                <label><input type='checkbox' checked={this.showCompleted}
                    onChange={event => { this.showCompleted = event.currentTarget.checked; this.update(); }} /> Completed</label>
            </div>
            {visible.length === 0
                ? <div className='connectome-notes-empty'>No tasks match the current filters.</div>
                : <div className='connectome-notes-list'>{[...grouped.entries()].map(([sourceUri, tasks]) =>
                    <div className='connectome-notes-group' key={sourceUri}>
                        <div className='connectome-notes-group-header'>
                            <span className={codicon('markdown') + ' connectome-notes-icon'} />
                            <span className='connectome-notes-group-name'>{new URI(sourceUri).path.name}</span>
                            <span className='connectome-notes-group-detail'>
                                {this.index.getWorkspaceRelativePath(new URI(sourceUri))}
                            </span>
                        </div>
                        {tasks.map(task => <div className={'connectome-task-row' + (task.completed ? ' completed' : '')}
                            key={`${task.line}:${task.checkboxStartCol}`} style={{ paddingLeft: `${8 + task.indentation}px` }}>
                            <input type='checkbox' checked={task.completed} title='Toggle task'
                                onChange={() => this.toggle(task)} />
                            <button className='connectome-task-text' title={`Line ${task.line + 1}`}
                                onClick={() => this.open(task)}>{task.text || '(empty task)'}</button>
                        </div>)}
                    </div>
                )}</div>}
        </div>;
    }

    protected open(task: TaskOccurrence): void {
        this.editorManager.open(new URI(task.sourceUri), {
            selection: {
                start: { line: task.line, character: task.checkboxStartCol },
                end: { line: task.line, character: task.checkboxEndCol }
            }
        });
    }

    protected async toggle(task: TaskOccurrence): Promise<void> {
        await this.toggleService.toggle(task);
        this.refresh();
    }
}
