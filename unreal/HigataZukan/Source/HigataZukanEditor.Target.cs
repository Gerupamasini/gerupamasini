using UnrealBuildTool;

public class HigataZukanEditorTarget : TargetRules
{
	public HigataZukanEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.AddRange(new string[] { "HigataZukan", "HigataTide" });
	}
}
