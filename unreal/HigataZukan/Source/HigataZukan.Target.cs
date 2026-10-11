using UnrealBuildTool;

public class HigataZukanTarget : TargetRules
{
	public HigataZukanTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.AddRange(new string[] { "HigataZukan", "HigataTide" });
	}
}
