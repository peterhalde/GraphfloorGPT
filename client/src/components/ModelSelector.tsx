import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface ModelConfig {
  provider: 'anthropic' | 'openai' | 'azure-openai';
  model: string;
  temperature?: number;
  maxTokens?: number;
}

interface AvailableModels {
  current: ModelConfig;
  available: {
    provider: string;
    models: string[];
    available: boolean;
  }[];
}

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
  'gpt-5': 'GPT-5 (Latest)',
  'gpt-4-turbo-preview': 'GPT-4 Turbo',
  'gpt-4': 'GPT-4',
  'gpt-4-turbo': 'GPT-4 Turbo (Azure)',
};

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  'anthropic': 'Anthropic',
  'openai': 'OpenAI',
  'azure-openai': 'Azure OpenAI',
};

export default function ModelSelector() {
  const { toast } = useToast();
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Fetch available models
  const { data: modelsData, isLoading } = useQuery<AvailableModels>({
    queryKey: ["/api/models/available"],
    refetchInterval: 60000, // Refresh every minute
  });

  // Set initial values when data loads
  useEffect(() => {
    if (modelsData?.current) {
      setSelectedProvider(modelsData.current.provider);
      setSelectedModel(modelsData.current.model);
    }
  }, [modelsData]);

  // Update model mutation
  const updateModelMutation = useMutation({
    mutationFn: async ({ provider, model }: { provider: string; model: string }) => {
      const response = await apiRequest("POST", "/api/models/select", {
        provider,
        model,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Model updated",
        description: `Now using ${MODEL_DISPLAY_NAMES[data.config.model] || data.config.model}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update model",
        description: error.message || "Please check your API keys",
        variant: "destructive",
      });
    },
  });

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    // Select the first available model for this provider
    const providerInfo = modelsData?.available.find(p => p.provider === provider);
    if (providerInfo && providerInfo.models.length > 0) {
      const firstModel = providerInfo.models[0];
      setSelectedModel(firstModel);
      // Update the model
      updateModelMutation.mutate({ provider, model: firstModel });
    }
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    updateModelMutation.mutate({ provider: selectedProvider, model });
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading models...</span>
      </div>
    );
  }

  const availableProviders = modelsData?.available.filter(p => p.available) || [];
  const currentProviderModels = availableProviders.find(p => p.provider === selectedProvider)?.models || [];

  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <Label htmlFor="provider-select" className="text-sm">Provider:</Label>
        <Select value={selectedProvider} onValueChange={handleProviderChange}>
          <SelectTrigger id="provider-select" className="w-[140px] h-8">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((provider) => (
              <SelectItem key={provider.provider} value={provider.provider}>
                {PROVIDER_DISPLAY_NAMES[provider.provider] || provider.provider}
              </SelectItem>
            ))}
            {modelsData?.available.filter(p => !p.available).map((provider) => (
              <SelectItem key={provider.provider} value={provider.provider} disabled>
                {PROVIDER_DISPLAY_NAMES[provider.provider] || provider.provider} (No API key)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <Label htmlFor="model-select" className="text-sm">Model:</Label>
        <Select 
          value={selectedModel} 
          onValueChange={handleModelChange}
          disabled={!selectedProvider || currentProviderModels.length === 0}
        >
          <SelectTrigger id="model-select" className="w-[180px] h-8">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {currentProviderModels.map((model) => (
              <SelectItem key={model} value={model}>
                {MODEL_DISPLAY_NAMES[model] || model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {updateModelMutation.isPending && (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
    </div>
  );
}