export type ToolContext={tenantId:string;userId:string;permissions:readonly string[];approvalId?:string};
export type Tool={name:string;permission:string;sensitive:boolean;execute:(context:ToolContext,input:unknown)=>Promise<unknown>};
export class ToolRegistry{
 private tools=new Map<string,Tool>();
 register(tool:Tool){if(this.tools.has(tool.name))throw new Error('Duplicate tool');this.tools.set(tool.name,tool);}
 async execute(name:string,context:ToolContext,input:unknown){const tool=this.tools.get(name);if(!tool||!context.tenantId||!context.userId||!context.permissions.includes(tool.permission))throw new Error('Tool access denied');if(tool.sensitive)throw new Error('Sensitive tools are disabled in phase one');return tool.execute(context,input);}
}
