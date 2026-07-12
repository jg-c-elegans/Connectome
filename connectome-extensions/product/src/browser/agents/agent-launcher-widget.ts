import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { BaseWidget, Message, WidgetFactory } from '@theia/core/lib/browser';
import { AgentDefinition, AgentKind } from './agent-ids';

export const AgentLauncherOptions = Symbol('AgentLauncherOptions');
export interface AgentLauncherOptions {
    readonly definition: AgentDefinition;
}

/**
 * Empty right-rail host: provides the activity icon until a terminal session
 * replaces it. Clicking the rail tab activates this widget; the contribution
 * listens and opens the agent terminal.
 */
@injectable()
export class AgentLauncherWidget extends BaseWidget {

    static createFactory(container: interfaces.Container, definition: AgentDefinition): WidgetFactory {
        return {
            id: definition.launcherId,
            createWidget: () => {
                const child = container.createChild();
                child.bind(AgentLauncherOptions).toConstantValue({ definition });
                child.bind(AgentLauncherWidget).toSelf();
                return child.get(AgentLauncherWidget);
            },
        };
    }

    readonly agentKind: AgentKind;

    constructor(@inject(AgentLauncherOptions) options: AgentLauncherOptions) {
        super();
        const def = options.definition;
        this.agentKind = def.kind;
        this.id = def.launcherId;
        this.title.label = def.title;
        this.title.caption = def.title;
        this.title.iconClass = def.iconClass;
        this.title.closable = false;
        this.addClass('connectome-agent-launcher');
        this.node.tabIndex = 0;
        this.node.setAttribute('role', 'region');
        this.node.setAttribute('aria-label', def.title);
        const hint = document.createElement('div');
        hint.className = 'connectome-agent-launcher__hint';
        hint.textContent = `Opening ${def.title}…`;
        hint.style.padding = '12px';
        hint.style.opacity = '0.7';
        this.node.appendChild(hint);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
        window.dispatchEvent(new CustomEvent('connectome-agent-launcher-activate', {
            detail: this.agentKind,
        }));
    }
}
