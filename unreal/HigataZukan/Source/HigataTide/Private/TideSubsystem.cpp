#include "TideSubsystem.h"

#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

DEFINE_LOG_CATEGORY_STATIC(LogHigataTide, Log, All);

namespace
{
	const FDateTime UnixEpoch(1970, 1, 1);

	/** Parse the web build's station JSON (see TideStationData in src/tide/TideModel.ts). */
	bool ParseStation(const FString& Text, HigataTide::FStation& Out, FString& Error)
	{
		TSharedPtr<FJsonObject> Root;
		if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) || !Root.IsValid())
		{
			Error = TEXT("not valid JSON");
			return false;
		}

		FString Id, Reference, Convention;
		if (!Root->TryGetStringField(TEXT("id"), Id) || !Root->TryGetStringField(TEXT("phaseReference"), Reference))
		{
			Error = TEXT("missing id or phaseReference");
			return false;
		}
		Out.Id = TCHAR_TO_UTF8(*Id);
		Root->TryGetNumberField(TEXT("lat"), Out.Lat);
		Root->TryGetNumberField(TEXT("lon"), Out.Lon);

		if (Reference == TEXT("UTC"))
		{
			Out.PhaseReference = HigataTide::EPhaseReference::UTC;
		}
		else if (Reference == TEXT("JST135E"))
		{
			Out.PhaseReference = HigataTide::EPhaseReference::JST135E;
		}
		else
		{
			Error = FString::Printf(TEXT("unknown phaseReference %s"), *Reference);
			return false;
		}
		Out.PhaseConvention = Root->TryGetStringField(TEXT("phaseConvention"), Convention) && Convention == TEXT("meridian_species")
			? HigataTide::EPhaseConvention::MeridianSpecies
			: HigataTide::EPhaseConvention::ZoneSpeed;

		const TArray<TSharedPtr<FJsonValue>>* Constituents = nullptr;
		if (!Root->TryGetArrayField(TEXT("constituents"), Constituents))
		{
			Error = TEXT("missing constituents");
			return false;
		}
		for (const TSharedPtr<FJsonValue>& Value : *Constituents)
		{
			TSharedPtr<FJsonObject> C;
			if (Value.IsValid())
			{
				C = Value->AsObject();
			}
			FString Name;
			HigataTide::FStationConstituent Sc;
			if (!C.IsValid() || !C->TryGetStringField(TEXT("name"), Name) || !C->TryGetNumberField(TEXT("amplitude_cm"), Sc.AmplitudeCm)
				|| !C->TryGetNumberField(TEXT("phase_deg"), Sc.PhaseDeg))
			{
				Error = TEXT("malformed constituent");
				return false;
			}
			Sc.Name = TCHAR_TO_UTF8(*Name);
			Out.Constituents.push_back(Sc);
		}
		return true;
	}
}

bool UTideSubsystem::LoadStation(const FString& StationId)
{
	const FString Path = FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Data/tide/stations"), StationId + TEXT(".json"));
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *Path))
	{
		UE_LOG(LogHigataTide, Error, TEXT("Cannot read %s (run tools/unreal/sync-data.mjs)"), *Path);
		return false;
	}

	HigataTide::FStation Station;
	FString Error;
	if (!ParseStation(Text, Station, Error))
	{
		UE_LOG(LogHigataTide, Error, TEXT("%s: %s"), *Path, *Error);
		return false;
	}

	Model = MakeUnique<HigataTide::FTideModel>(Station);
	for (const std::string& Name : Model->GetUnknownConstituents())
	{
		UE_LOG(LogHigataTide, Warning, TEXT("%s: unknown constituent %s ignored"), *StationId, UTF8_TO_TCHAR(Name.c_str()));
	}
	return true;
}

double UTideSubsystem::GetLevelAt(const FDateTime& Utc) const
{
	return Model ? Model->Level(ToEpochMs(Utc)) : 0.0;
}

double UTideSubsystem::GetRateAt(const FDateTime& Utc) const
{
	return Model ? Model->Rate(ToEpochMs(Utc)) : 0.0;
}

TArray<FTideExtremum> UTideSubsystem::GetExtrema(const FDateTime& FromUtc, const FDateTime& ToUtc) const
{
	TArray<FTideExtremum> Out;
	if (!Model)
	{
		return Out;
	}
	for (const HigataTide::FExtremum& E : Model->Extrema(ToEpochMs(FromUtc), ToEpochMs(ToUtc)))
	{
		FTideExtremum& X = Out.AddDefaulted_GetRef();
		X.Time = FromEpochMs(E.TimeMs);
		X.LevelM = E.Level;
		X.bHigh = E.bHigh;
	}
	return Out;
}

double UTideSubsystem::GetMaxAmplitude() const
{
	return Model ? Model->MaxAmplitude() : 0.0;
}

double UTideSubsystem::ToEpochMs(const FDateTime& Utc)
{
	return (Utc - UnixEpoch).GetTotalMilliseconds();
}

FDateTime UTideSubsystem::FromEpochMs(double Ms)
{
	return UnixEpoch + FTimespan::FromMilliseconds(Ms);
}
