import QtQuick
import Quickshell
import Quickshell.Services.Pipewire
import qs.Ui

// Bar button for kokoro-speak. Left-click speaks the primary selection (highlighted
// text), right-click the clipboard; either click stops speech that's playing.
// "Speaking" is read from PipeWire: kokoro-speak names its pw-play stream
// "kokoro-speak", so speech started from the keys lights the button up too.
BarWidget {
  id: root
  moduleName: "sloptts.speak"

  readonly property string command: Quickshell.env("HOME") + "/.local/bin/kokoro-speak"
  readonly property var nodes: Pipewire.nodes ? Pipewire.nodes.values : []

  readonly property bool speaking: {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i]
      if (node && node.isStream && node.name === "kokoro-speak") return true
    }
    return false
  }

  // Between a click and the first audio (synthesis takes a moment), so the
  // button reacts right away
  property bool starting: false
  onSpeakingChanged: if (speaking) starting = false

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function speak(clipboard) {
    starting = !speaking
    if (starting) startTimeout.restart()
    var args = [command, "--toggle"]
    if (clipboard) args.push("--clipboard")
    Quickshell.execDetached(args)
  }

  // kokoro-speak exits without a stream when there's nothing to speak
  Timer {
    id: startTimeout
    interval: 5000
    onTriggered: root.starting = false
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.speaking ? "󰓛" : "󰗋"
    active: root.speaking || root.starting
    tooltipText: root.speaking ? "Speaking (click to stop)"
               : "Speak selection\nRight-click: speak clipboard"
    onPressed: function(b) { root.speak(b === Qt.RightButton) }
  }
}
