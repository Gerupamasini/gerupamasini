#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "TideCore/TideCore.h"
#include "TideSubsystem.generated.h"

USTRUCT(BlueprintType)
struct HIGATATIDE_API FTideExtremum
{
	GENERATED_BODY()

	/** UTC. */
	UPROPERTY(BlueprintReadOnly, Category = "Tide")
	FDateTime Time;

	/** Metres relative to mean sea level. */
	UPROPERTY(BlueprintReadOnly, Category = "Tide")
	double LevelM = 0.0;

	UPROPERTY(BlueprintReadOnly, Category = "Tide")
	bool bHigh = false;
};

/**
 * The tide of the current map's station. Station data is the same JSON as the web build
 * (public/data/tide/stations/<id>.json), staged to Content/Data by tools/unreal/sync-data.mjs.
 */
UCLASS()
class HIGATATIDE_API UTideSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	/** Load Content/Data/tide/stations/<StationId>.json. Returns false (and keeps the previous station) on failure. */
	UFUNCTION(BlueprintCallable, Category = "Tide")
	bool LoadStation(const FString& StationId);

	UFUNCTION(BlueprintPure, Category = "Tide")
	bool HasStation() const { return Model.IsValid(); }

	/** Metres relative to mean sea level at a UTC moment. 0 without a station. */
	UFUNCTION(BlueprintPure, Category = "Tide")
	double GetLevelAt(const FDateTime& Utc) const;

	/** Metres per hour. */
	UFUNCTION(BlueprintPure, Category = "Tide")
	double GetRateAt(const FDateTime& Utc) const;

	/** High and low waters between two UTC moments. */
	UFUNCTION(BlueprintCallable, Category = "Tide")
	TArray<FTideExtremum> GetExtrema(const FDateTime& FromUtc, const FDateTime& ToUtc) const;

	/** Sum of the constituent amplitudes (metres): the largest possible departure from mean sea level. */
	UFUNCTION(BlueprintPure, Category = "Tide")
	double GetMaxAmplitude() const;

	/** UTC moment ↔ JavaScript epoch milliseconds, the time unit of the tide core and the save data. */
	static double ToEpochMs(const FDateTime& Utc);
	static FDateTime FromEpochMs(double Ms);

	const HigataTide::FTideModel* GetModel() const { return Model.Get(); }

private:
	TUniquePtr<HigataTide::FTideModel> Model;
};
