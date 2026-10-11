using UnrealBuildTool;

// The harmonic tide model. TideCore/ is plain C++ shared with the standalone golden test (unreal/tests/tide);
// TideSubsystem wraps it for gameplay and Blueprints.
public class HigataTide : ModuleRules
{
	public HigataTide(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine" });
		PrivateDependencyModuleNames.AddRange(new string[] { "Json" });
	}
}
