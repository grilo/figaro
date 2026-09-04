package desktop

import "strings"

const windowKeyboardResizeDelta = 20

type windowResizePlan struct {
	x      int
	y      int
	width  int
	height int
	move   bool
}

func planWindowResize(direction string, x, y, width, height int) (windowResizePlan, bool) {
	plan := windowResizePlan{x: x, y: y, width: width, height: height}
	switch strings.ToUpper(direction) {
	case "N":
		plan.y -= windowKeyboardResizeDelta
		plan.height += windowKeyboardResizeDelta
		plan.move = true
	case "S":
		plan.height += windowKeyboardResizeDelta
	case "E":
		plan.width += windowKeyboardResizeDelta
	case "W":
		plan.x -= windowKeyboardResizeDelta
		plan.width += windowKeyboardResizeDelta
		plan.move = true
	case "NE":
		plan.y -= windowKeyboardResizeDelta
		plan.width += windowKeyboardResizeDelta
		plan.height += windowKeyboardResizeDelta
		plan.move = true
	case "NW":
		plan.x -= windowKeyboardResizeDelta
		plan.y -= windowKeyboardResizeDelta
		plan.width += windowKeyboardResizeDelta
		plan.height += windowKeyboardResizeDelta
		plan.move = true
	case "SE":
		plan.width += windowKeyboardResizeDelta
		plan.height += windowKeyboardResizeDelta
	case "SW":
		plan.x -= windowKeyboardResizeDelta
		plan.width += windowKeyboardResizeDelta
		plan.height += windowKeyboardResizeDelta
		plan.move = true
	default:
		return windowResizePlan{}, false
	}
	return plan, true
}
