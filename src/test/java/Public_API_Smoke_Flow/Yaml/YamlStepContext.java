package Public_API_Smoke_Flow.Yaml;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.File;
import java.io.IOException;

public class YamlStepContext {

    private static final String RESOURCE_ROOT = "src/test/resources/";

    private final YamlStep step;
    private final ObjectMapper jsonMapper;

    public YamlStepContext(YamlStep step, ObjectMapper jsonMapper){
        this.step = step;
        this.jsonMapper = jsonMapper;
    }

    public YamlStep getStep() {
        return step;
    }

    public <T> T getPayload(Class<T> type) throws IOException{
        if(step.getPayloadFile() == null) {
            throw new IllegalStateException("Step '"+ step.getName() + "' has no payloadFile, but it's action requires 1.");
        }
        File file = new File(RESOURCE_ROOT + step.getPayloadFile());
        return jsonMapper.readValue(file, type);
    }
}
