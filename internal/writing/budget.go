package writing

// AnalysisBudgetMillis is source-size policy, independent of timers/processes.
// The adapter uses UTF-8 byte length without scanning the note.
func AnalysisBudgetMillis(sourceBytes int) int {
	budget := ((sourceBytes + 65535) / 65536) * 2000
	if budget < 5000 {
		return 5000
	}
	if budget > 30000 {
		return 30000
	}
	return budget
}
