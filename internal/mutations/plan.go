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
		// A folder dropped on its own parent finds itself at the destination.
		// That is not a second folder to merge with.
		if sourceIsDirectory && samePath(source, destination, caseInsensitive) {
			return MovePlan{Destination: destination, Error: SameFolderError}
		}
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

// SameFolderError tells the user that a folder was moved or merged onto the
// place it already occupies.
const SameFolderError = "The folder is already in this location"

// DirectoryMergeFacts is what the adapter established on disk about a folder
// merge. The paths alone do not settle it: on a case-insensitive volume the
// destination "Notes" of merging "notes/Notes" into the vault root is the
// folder "notes" that holds the source. The adapter therefore reports which
// directory entries the names reach; the plan combines that with the names.
type DirectoryMergeFacts struct {
	// CaseInsensitive compares the paths without regard to letter case.
	CaseInsensitive bool
	// DestinationIsSource is true when the destination name reaches the
	// source folder's own directory entry.
	DestinationIsSource bool
	// TargetInsideSource is true when the target folder is the source itself
	// or lies beneath it.
	TargetInsideSource bool
	// SourceBelowDestination is the source's path relative to the destination
	// when the destination is one of the source's ancestors, and "" otherwise.
	SourceBelowDestination string
	// NamesakeIsDirectory is true when the source holds a folder at the path
	// DirectoryMergeNamesake returns.
	NamesakeIsDirectory bool
}

// DirectoryMergePlan is the decision for merging one folder into the
// same-named folder of a target directory. A non-empty Error refuses the
// merge; nothing may be written.
type DirectoryMergePlan struct {
	Destination string
	Error       string
}

// DirectoryMergeNamesake returns the path inside source that a merge into one
// of source's own ancestors maps onto source itself, or "" when the
// destination is not an ancestor. Merging "X/X" into the vault root writes
// "X/X/<name>" to "X/<name>", so the entry "X/X/X" lands on "X/X": the folder
// being merged. If that entry is a folder its contents would be copied into
// the source and deleted with it.
func DirectoryMergeNamesake(source, targetDirectory string, facts DirectoryMergeFacts) string {
	source = filepath.Clean(source)
	below := filepath.Clean(facts.SourceBelowDestination)
	if facts.SourceBelowDestination == "" {
		var beneath bool
		below, beneath = pathBelow(Destination(source, targetDirectory), source, facts.CaseInsensitive)
		if !beneath {
			return ""
		}
	}
	if below == "." {
		return ""
	}
	return filepath.Join(source, below)
}

// PlanDirectoryMerge decides whether source may be merged into the same-named
// folder inside targetDirectory. It refuses a merge of a folder with itself,
// a merge into the folder's own subtree, and a merge into an ancestor that
// would write a folder over the source.
func PlanDirectoryMerge(source, targetDirectory string, facts DirectoryMergeFacts) DirectoryMergePlan {
	destination := Destination(source, targetDirectory)
	if facts.DestinationIsSource || samePath(source, destination, facts.CaseInsensitive) {
		return DirectoryMergePlan{Destination: destination, Error: SameFolderError}
	}
	if facts.TargetInsideSource || IsSameOrDescendant(source, targetDirectory, facts.CaseInsensitive) {
		return DirectoryMergePlan{Destination: destination, Error: "Cannot move a directory into itself"}
	}
	if namesake := DirectoryMergeNamesake(source, targetDirectory, facts); namesake != "" && facts.NamesakeIsDirectory {
		inner, _ := filepath.Rel(filepath.Clean(source), namesake)
		return DirectoryMergePlan{
			Destination: destination,
			Error: fmt.Sprintf(
				"Cannot merge %q into the folder that contains it, because the %q folder inside it would take the place of the folder being merged. Rename or move that inner folder first.",
				filepath.Base(filepath.Clean(source)),
				filepath.ToSlash(inner),
			),
		}
	}
	return DirectoryMergePlan{Destination: destination}
}

func samePath(first, second string, caseInsensitive bool) bool {
	first = filepath.Clean(first)
	second = filepath.Clean(second)
	if caseInsensitive {
		return strings.EqualFold(first, second)
	}
	return first == second
}

// pathBelow returns child's path relative to parent when child lies strictly
// beneath parent. Names are compared one path segment at a time, and the
// result keeps child's own spelling.
func pathBelow(parent, child string, caseInsensitive bool) (string, bool) {
	separator := string(filepath.Separator)
	childParts := strings.Split(filepath.Clean(child), separator)
	var parentParts []string
	if parent = filepath.Clean(parent); parent != "." {
		parentParts = strings.Split(parent, separator)
	}
	if len(childParts) <= len(parentParts) || childParts[0] == "." {
		return "", false
	}
	for index, name := range parentParts {
		if name != childParts[index] && !(caseInsensitive && strings.EqualFold(name, childParts[index])) {
			return "", false
		}
	}
	return filepath.Join(childParts[len(parentParts):]...), true
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
