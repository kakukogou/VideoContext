//Matthew Shotton, R&D User Experience,© BBC 2015
import SourceNode, { SOURCENODESTATE } from "./sourcenode";
import { NodeException } from "../exceptions.js";

function hasSeekToNextFrame() {
    return !!(document.createElement("video").seekToNextFrame);
}

export default class OfflineVideoNode extends SourceNode {
    constructor(src, gl, renderGraph, currentTime, globalPlaybackRate=1.0, sourceOffset=0, preloadTime = 4, loop=false){

        if (!hasSeekToNextFrame()) {
            throw new NodeException("Your browser does not support HTMLMediaElement::seekToNextFrame() API.\
                                     Please download Firefox Nightly!");
        }

        super(src, gl, renderGraph, currentTime);
        this._preloadTime = preloadTime;
        this._sourceOffset = sourceOffset;
        this._globalPlaybackRate = globalPlaybackRate;
        this._playbackRate = 1.0;
        this._playbackRateUpdated = true;
        this._loopElement = loop;

        this._nextFrameTime = -1; // would be better to use a Time object.
        this._prevNextFrameTime = -1;
        this._seekToNextFramePromise = null;
    }

    set playbackRate(playbackRate){
        this._playbackRate = playbackRate;
        this._playbackRateUpdated = true;
    }

    get playbackRate(){
        return this._playbackRate;
    }

    _needToWaitForSeeking() {
        if (this._element.seeking && !(!!this._seekToNextFramePromise)) {
          return true;
        }
        return false;
    }

    _load(){
        //super._load();
        if (this._element !== undefined){
            this._element.loop = this._loopElement;
            if (this._element.readyState > 3 && !this._needToWaitForSeeking()){
                if(this._loopElement === false){
                    if (this._stopTime === Infinity || this._stopTime == undefined){
                        this._stopTime = this._startTime + this._element.duration;
                        this._triggerCallbacks("durationchange", this.duration);
                    }
                }
                if(this._ready !== true) this._triggerCallbacks("loaded");
                this._ready = true;
                this._playbackRateUpdated = true;

            } else{
                this._ready = false;
            }
            return;
        }
        if (this._isResponsibleForElementLifeCycle){
            this._element = document.createElement("video");
            this._element.setAttribute('crossorigin', 'anonymous');
            this._element.src = this._elementURL;
            this._element.loop = this._loopElement;
            this._playbackRateUpdated = true;
            this._triggerCallbacks("load");
        }
        // this._element.currentTime = this._sourceOffset;
        this._element.currentTime = this._startTime;
    }

    _destroy(){
      console.log("[OfflineVideoNode::_destroy()]");
        super._destroy();
        if (this._isResponsibleForElementLifeCycle && this._element !== undefined){
            this._element.src = "";
            this._element = undefined;
            delete this._element;
        }
        this._ready = false;
    }

    _seek(time){
      console.log("[OfflineVideoNode::_seek() time = ]" + time);
        super._seek(time);
        if (this.state === SOURCENODESTATE.playing || this.state === SOURCENODESTATE.paused){
            if (this._element === undefined) this._load();
            let relativeTime = this._currentTime - this._startTime + this._sourceOffset;
            this._element.currentTime = relativeTime;
            this._ready = false;
        }
        if((this._state === SOURCENODESTATE.sequenced || this._state === SOURCENODESTATE.ended) && this._element !== undefined){
            this._destroy();
        }
    }

    _update(currentTime){
        //if (!super._update(currentTime)) return false;
        super._update(currentTime);
        //check if the video has ended
        if(this._element !== undefined){
            if (this._element.ended){
                this._state = SOURCENODESTATE.ended;
                this._triggerCallbacks("ended");
            }
        }

        if (this._startTime - this._currentTime < this._preloadTime && this._state !== SOURCENODESTATE.waiting && this._state !== SOURCENODESTATE.ended)this._load();

        if (this._state === SOURCENODESTATE.playing){
            if (this._playbackRateUpdated)
            {
                this._element.playbackRate = this._globalPlaybackRate * this._playbackRate;
                this._playbackRateUpdated = false;
            }
            // We do not play in the OfflineVideoNode, but we need a way to play audio......
            // this._element.play();
            return true;
        } else if (this._state === SOURCENODESTATE.paused){
            this._element.pause();
            return true;
        }
        else if (this._state === SOURCENODESTATE.ended && this._element !== undefined){
            this._element.pause();
            this._destroy();
            return false;
        }
    }

    _updateTexture(currentTime) {
        super._incrementUpdateTextureCallCount();
        if (this._nextFrameTime == -1 || currentTime >= this._nextFrameTime) {

            if (!!this._seekToNextFramePromise) {
                // still seeking...
                return;
            }

            super._updateTexture(currentTime);
            this._nextFrameTime = -1;
            this._seekToNextFramePromise = this._element.seekToNextFrame();
            this._seekToNextFramePromise.then(
                () => {
                    // console.log("seekToNextFrame resolved.");
                    this._nextFrameTime = this._element.currentTime;
                    this._seekToNextFramePromise = null;
                },
                () => {
                    // console.log("seekToNextFrame failed.");
                    this._seekToNextFramePromise = null;
                }
            );
        }
    }

    clearTimelineState(){
        super.clearTimelineState();
        if (this._element !== undefined) this._element.pause();
        this._destroy();
    }

}
