package mutations

import (
	"fmt"
	"path/filepath"
	"strings"
)

const RecursiveCopyError = "A folder cannot be copied into itself or one of its descendants because that would cause a recursive copy. Select its parent folder to create a sibling copy instead."

type MovePlan struct {
	Destination    string
	Error          string
	MergeAvailable bool
}

func Destination(source, targetDirectory string) string {
	name := filepath.Base(filepath.Clean(source))
	if filepath.Clean(targetDirectory) == "." {
		return name
	}
	return filepath.Join(filepath.Clean(targetDirectory), name)
}

func PlanMove(
	source string,
	targetDirectory string,
	sourceIsDirectory bool,
	destinationExists bool,
	destinationIsDirectory bool,
	caseInsensitive bool,
) MovePlan {
	destination := Destination(source, targetDirectory)
	if sourceIsDirectory && IsSameOrDescendant(source, targetDirectory, caseInsensitive) {
		return MovePlan{Destination: destination, Error: "Cannot move a directory into itself"}
	}
	if destinationExists {
		if sourceIsDirectory && destinationIsDirectory {
			return MovePlan{
				Destination:    destination,
				Error:          "Destination directory already exists",
				MergeAvailable: true,
			}
		}
		return MovePlan{Destination: destination, Error: "Destination exists"}
	}
	return MovePlan{Destination: destination}
}

func ValidateCopy(source, targetDirectory string, sourceIsDirectory, caseInsensitive bool) string {
	if sourceIsDirectory && IsSameOrDescendant(source, targetDirectory, caseInsensitive) {
		return RecursiveCopyError
	}
	return ""
}

func IsSameOrDescendant(parent, candidate string, caseInsensitive bool) bool {
	parent = filepath.Clean(parent)
	candidate = filepath.Clean(candidate)
	if caseInsensitive {
		parent = strings.ToLower(parent)
		candidate = strings.ToLower(candidate)
	}
	return candidate == parent || strings.HasPrefix(candidate, parent+string(filepath.Separator))
}

func CopyCollisionName(name string, isDirectory bool, index int) string {
	return collisionName(name, isDirectory, index, false)
}

func ParenthesizedCopyCollisionName(name string, isDirectory bool, index int) string {
	return collisionName(name, isDirectory, index, true)
}

func collisionName(name string, isDirectory bool, index int, parenthesized bool) string {
	suffix := " copy"
	if parenthesized {
		suffix = " (copy)"
	}
	if index > 1 {
		if parenthesized {
			suffix = fmt.Sprintf(" (copy %d)", index)
		} else {
			suffix += fmt.Sprintf(" %d", index)
		}
	}
	if isDirectory {
		return name + suffix
	}
	extension := filepath.Ext(name)
	if strings.HasSuffix(strings.ToLower(name), ".drawio.svg") {
		extension = name[len(name)-len(".drawio.svg"):]
	}
	if extension == "" || extension == name {
		return name + suffix
	}
	return strings.TrimSuffix(name, extension) + suffix + extension
}
