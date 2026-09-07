// Gamepad controls verified against the installed game's settings/inputmaps/xidevice.json.
// Extra keyboard actions use BeamNG's official Default Keyboard Bindings page.
export const GAME_ACTIONS = Object.freeze([
  {id:'reset',label:'重置车辆',group:'left',button:'BUTTON_RIGHT',mode:'tap',action:'reset_physics',hint:'重置当前车辆；任务中可能重新开始任务',clearDriving:true},
  {id:'recover',label:'修复/回溯',group:'left',button:'BUTTON_LEFT',mode:'hold',action:'recover_vehicle',hint:'点按修复，按住回溯',clearDriving:true},
  {id:'camera',label:'切换视角',group:'left',button:'BUTTON_Y',mode:'tap',action:'switch_camera_next'},
  {id:'pause',label:'暂停/继续',group:'left',key:0x4a,mode:'tap',action:'pause'},
  {id:'menu',label:'游戏菜单',group:'left',button:'BUTTON_PLAY',mode:'tap',action:'toggleMenues'},
  {id:'map',label:'地图',group:'left',button:'BUTTON_BACK',mode:'tap',action:'toggleBigMap'},
  {id:'horn',label:'喇叭',group:'right',key:0x48,mode:'hold',action:'horn',hint:'按住鸣笛'},
  {id:'lights',label:'车灯',group:'right',key:0x4e,mode:'tap',action:'toggle_headlights'},
  {id:'ignition',label:'点火/启动',group:'right',key:0x56,mode:'hold',action:'activateStarterMotor',hint:'点按切换点火，按住启动'},
  {id:'gearbox',label:'变速模式',group:'right',key:0x51,mode:'tap',action:'toggleShifterMode'},
  {id:'shiftDown',label:'降挡 −',group:'driving',button:'BUTTON_X',mode:'tap',action:'shiftDown'},
  {id:'shiftUp',label:'升挡 +',group:'driving',button:'BUTTON_A',mode:'tap',action:'shiftUp'},
  {id:'handbrake',label:'手刹',group:'driving',button:'BUTTON_B',mode:'hold',action:'parkingbrake',hint:'按住手刹，松手释放'}
]);

// Merge button actions with the live analog gamepad. Pointer owners keep
// simultaneous fingers and delayed tap releases from cancelling one another.
export class GameActionInput {
  constructor({buttons,sendKey,enabled=()=>true,onActivate=()=>{},schedule=(callback,delay)=>globalThis.setTimeout(callback,delay),cancel=timer=>globalThis.clearTimeout(timer)}) {
    Object.assign(this,{buttons,sendKey,enabled,onActivate,schedule,cancel});
    this.owners=new Map(); this.timers=new Map(); this.tapQueues=new Map(); this.serial=0;
  }
  press(id,owner) {
    if(!this.enabled() || this.owners.has(owner)) return false;
    const action=GAME_ACTIONS.find(a=>a.id === id);
    if(!action) return false;
    this.onActivate(action);
    const alreadyHeld=action.key != null && [...this.owners.values()].some(a=>a.key === action.key);
    this.owners.set(owner,action);
    if(action.key != null && !alreadyHeld) this.sendKey(true,action.key,0);
    return true;
  }
  release(owner) {
    const action=this.owners.get(owner);
    if(!action) return;
    this.owners.delete(owner);
    if(this.timers.has(owner)){this.cancel(this.timers.get(owner));this.timers.delete(owner);}
    if(action.key != null && ![...this.owners.values()].some(a=>a.key === action.key)) this.sendKey(false,action.key,0);
  }
  pulse(id) {
    if(!this.enabled() || !GAME_ACTIONS.some(action=>action.id === id)) return;
    let queue=this.tapQueues.get(id);
    if(queue){queue.remaining=Math.min(queue.remaining+1,8);return;}
    queue={remaining:1};this.tapQueues.set(id,queue);this.nextTap(id,queue);
  }
  nextTap(id,queue) {
    if(this.tapQueues.get(id) !== queue) return;
    const owner=`tap-${++this.serial}`;
    queue.remaining--;
    if(!this.press(id,owner)){this.tapQueues.delete(id);return;}
    try {
      this.timers.set(owner,this.schedule(()=>{
        this.timers.delete(owner);this.release(owner);
        if(this.tapQueues.get(id) !== queue) return;
        if(!queue.remaining){this.tapQueues.delete(id);return;}
        // Leave at least two 60 Hz input samples between repeated presses.
        const gap=`gap-${++this.serial}`;
        this.timers.set(gap,this.schedule(()=>{this.timers.delete(gap);this.nextTap(id,queue);},35));
      },140));
    }
    catch(error) { this.tapQueues.delete(id);this.release(owner);throw error; }
  }
  releaseAll() {
    this.tapQueues.clear();
    for(const timer of this.timers.values()) this.cancel(timer);
    this.timers.clear();
    for(const owner of [...this.owners.keys()]) this.release(owner);
  }
  active(id) { return [...this.owners.values()].some(a=>a.id === id); }
  merge(state) {
    let mask=state.buttonFlags;
    for(const action of this.owners.values()) if(action.button) mask |= this.buttons[action.button];
    return {...state,buttonFlags:mask};
  }
}
