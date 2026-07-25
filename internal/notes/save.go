package notes

const ConflictError = "File modified externally"

type SaveRequest struct {
	Content         string
	ExpectedVersion float64
}

type SaveResult struct {
	Success bool
	Error   string
	Version float64
}

// SaveRepository is the I/O port used by Service. Implementations own path
// confinement, atomic writes, metadata reads, and index notifications.
type SaveRepository interface {
	CurrentVersion() (float64, bool)
	Write(string) (float64, error)
}

type Service struct {
	Repository SaveRepository
}

func (s Service) Save(request SaveRequest) (SaveResult, error) {
	if request.ExpectedVersion != 0 {
		actual, exists := s.Repository.CurrentVersion()
		if !exists || actual != request.ExpectedVersion {
			return SaveResult{
				Success: false,
				Error:   ConflictError,
				Version: actual,
			}, nil
		}
	}

	version, err := s.Repository.Write(request.Content)
	if err != nil {
		return SaveResult{}, err
	}
	return SaveResult{Success: true, Version: version}, nil
}
