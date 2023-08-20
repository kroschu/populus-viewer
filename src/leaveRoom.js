import { h, Component, Fragment } from 'preact';
import * as Matrix from "matrix-js-sdk"
import Client from './client.js'
import Modal from './modal.js'
import Resource from './utils/resource.js'

export default class LeaveRoom extends Component {
  leaveRoom = async _ => {
    await Client.client.leave(this.props.room.roomId)
    Modal.hide()
  }

  forgetRoom = async _ => {
    await Client.client.leave(this.props.room.roomId)
    await Client.client.forget(this.props.room.roomId)
    Modal.hide()
  }

  sort = Resource.hasResource(this.props.room)
    ? "discussion"
    : this.props.room.isSpaceRoom()
    ? "collection"
    : "annotation"

  deepForget = async _ => {
    const theState = this.props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theChildren = theState.getStateEvents(Matrix.EventType.SpaceChild)
      .filter(child => Client.client.getRoom(child.getStateKey()))
    await new Promise(res => this.setState({progress:0, childTotal:theChildren.length}, res))
    for (const child of theChildren) {
      await Client.client.leave(child.getStateKey())
      await Client.client.forget(child.getStateKey())
      await new Promise(res => this.setState(oldState => ({progress:oldState.progress + 1}), res))
    }
    this.forgetRoom()
  }

  render(_props,state) {
    return <div>
      <p>
        Щоб припинити отримувати оновлення про це {this.sort}, та видаліть його з вашого {this.sort} списку:</p>
      <button onClick={this.leaveRoom} class="styled-button">Leave this {this.sort}</button>
      <p>
        Щоб також видалити всю збережену історію, і більше не бачити {this.sort} як варіант долучитися{this.sort === "discussion" ? " або додати до мед. карти:" : ":"}
      </p>
      <button onClick={this.forgetRoom} class="styled-button">Forget this {this.sort}</button>
      { this.sort === "discussion" 
        ? <><p>
            Повністю видалити це спілкування <i>і всі пов'язані з ним анотації</i>:
          </p>
          <button onClick={this.deepForget} class="styled-button">Забудьте про цю розмову</button>
          {state.childTotal && <p> Forgetting: {state.progress} / {state.childTotal} </p>}
        </>
        : null
      }
    </div>
  }
}
