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

// IsCaseOnlyRename reports whether newPath gives oldPath's final name a
// different letter case and changes nothing else: same parent folder, same
// name once case is ignored.
func IsCaseOnlyRename(oldPath, newPath string) bool {
	oldPath = filepath.Clean(oldPath)
	newPath = filepath.Clean(newPath)
	if oldPath == newPath || filepath.Dir(oldPath) != filepath.Dir(newPath) {
		return false
	}
	return strings.EqualFold(filepath.Base(oldPath), filepath.Base(newPath))
}

// RenameDestinationOccupied decides whether an existing destination blocks a
// rename. On a case-insensitive filesystem "todo.md" and "Todo.md" are one
// directory entry, so looking up the new name finds the source itself; that
// is the one occupied destination a rename may proceed over. destinationIsSource
// must be true only when the adapter has established that the two names reach
// the same entry, not merely the same content.
func RenameDestinationOccupied(oldPath, newPath string, destinationExists, destinationIsSource bool) bool {
	if !destinationExists {
		return false
	}
	return !(destinationIsSource && IsCaseOnlyRename(oldPath, newPath))
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
	if diagramSuffix := EditableDiagramSuffix(name); diagramSuffix != "" {
		extension = name[len(name)-len(diagramSuffix):]
	}
	if extension == "" || extension == name {
		return name + suffix
	}
	return strings.TrimSuffix(name, extension) + suffix + extension
}

// editableDiagramSuffixes are the double extensions of Figaro's editable SVG
// formats. Copies and collisions keep them whole so a copy stays editable.
var editableDiagramSuffixes = []string{".drawio.svg", ".excalidraw.svg"}

// EditableDiagramSuffix returns the editable diagram suffix of name, matched
// case-insensitively, or "" for any other file.
func EditableDiagramSuffix(name string) string {
	lower := strings.ToLower(name)
	for _, suffix := range editableDiagramSuffixes {
		if strings.HasSuffix(lower, suffix) {
			return suffix
		}
	}
	return ""
}
