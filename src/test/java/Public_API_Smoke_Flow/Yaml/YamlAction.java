package Public_API_Smoke_Flow.Yaml;

import io.restassured.response.Response;

@FunctionalInterface
public interface YamlAction {
    Response execute(YamlStepContext context) throws Exception;
}
